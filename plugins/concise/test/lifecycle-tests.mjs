import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CHECK_EDIT, CHECK_REPLY, ROOT, run, ok, bad, assertDenied } from "./lib.mjs";
import { setup, cleanup, dashOn, writeEvent, transcript, assertBlocked, assertEmpty } from "./features-lib.mjs";
import { modelNotices } from "../hooks/lib/respond.mjs";
import { bumpAttempt, cleanupSession, statePath, withStateScope } from "../hooks/lib/state.mjs";
import { recordsPath } from "../hooks/lib/projects.mjs";

const SESSION_END = join(ROOT, "hooks", "session-end.mjs");
const dirty = "Ship it — fast.";
const sessions = new Set();
const check = (name, condition, actual) => condition ? ok(name) : bad(name, JSON.stringify(actual));

function event(c, extra = {}) {
  sessions.add(c.sid);
  return { cwd: c.dir, session_id: c.sid, hook_event_name: "SubagentStop", agent_id: "agent-a", agent_type: "worker", last_assistant_message: dirty, ...extra };
}

function runAsync(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        if (code !== 0) throw new Error(stderr || `hook exited ${code}`);
        resolve(JSON.parse(stdout));
      } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

console.log("\nlifecycle (event output)");

for (const name of ["SessionStart", "SubagentStart", "UserPromptSubmit", "PostToolUse"]) {
  const result = modelNotices({ systemMessage: "[concise] context", hookSpecificOutput: { additionalContext: "existing context" } }, name);
  check(`${name} context keeps its event name`, result.hookSpecificOutput.hookEventName === name, result);
  check(`${name} merges existing model context`, result.hookSpecificOutput.additionalContext === "existing context\n\n[concise] context", result);
}
for (const name of ["Stop", "SubagentStop", "SessionEnd"]) {
  const result = modelNotices({ systemMessage: "[concise] context" }, name);
  check(`${name} notice uses the stop-compatible output`, !result.hookSpecificOutput, result);
}

console.log("\nlifecycle (subagent reply)");

{
  const c = setup(dashOn());
  const cleanPath = transcript(c, "clean.jsonl", "Ship it fast.");
  const dirtyPath = transcript(c, "dirty.jsonl", dirty);
  const input = event(c, { agent_transcript_path: cleanPath, transcript_path: cleanPath });
  assertBlocked("the supplied subagent reply takes precedence", run(CHECK_REPLY, input));
  const confirmed = run(CHECK_REPLY, { ...input, stop_hook_active: true });
  check("SubagentStop confirmation ends continuation", !confirmed.decision && !confirmed.hookSpecificOutput && confirmed.systemMessage?.includes("Kept after confirmation"), confirmed);
  assertEmpty("an empty supplied subagent reply is authoritative", run(CHECK_REPLY, { ...input, last_assistant_message: "", agent_transcript_path: dirtyPath }));
  assertBlocked("SubagentStop reads the agent transcript", run(CHECK_REPLY, event(c, { agent_id: "agent-b", last_assistant_message: null, agent_transcript_path: dirtyPath, transcript_path: cleanPath })));
  assertEmpty("SubagentStop skips a parent transcript without an agent transcript", run(CHECK_REPLY, event(c, { last_assistant_message: null, transcript_path: dirtyPath })));
  assertEmpty("an unreadable agent transcript does not select the parent", run(CHECK_REPLY, event(c, { last_assistant_message: null, agent_transcript_path: join(c.dir, "missing.jsonl"), transcript_path: dirtyPath })));
}

for (const config of [{ subagentStop: { enabled: false } }, { subagentStop: { exemptAgentTypes: ["worker"] } }, { stopHook: false }]) {
  const c = setup({ ...dashOn(), ...config });
  assertEmpty("subagent reply config skips the selected event", run(CHECK_REPLY, event(c)));
}

{
  const c = setup({ ...dashOn(), subagentStop: { exemptAgentTypes: ["explorer"] } });
  assertBlocked("other agent types retain the reply check", run(CHECK_REPLY, event(c)));
  assertBlocked("SubagentStop ask mode uses a stop block", run(CHECK_REPLY, event(setup(dashOn({ mode: "ask" })))));
  const soft = run(CHECK_REPLY, event(c, { agent_id: "soft" }), { BEC_HOOK_SOFT_FAIL: "1" });
  check("SubagentStop soft fail has a UI notice and no block", !soft.decision && !soft.hookSpecificOutput && soft.systemMessage?.includes("soft-fail"), soft);
  const bypass = setup({ ...dashOn(), bypass: { phrases: ["approved wording"] } });
  const result = run(CHECK_REPLY, event(bypass, { last_assistant_message: `${dirty} approved wording` }));
  check("SubagentStop bypass uses valid stop output", !result.decision && !result.hookSpecificOutput && result.systemMessage?.includes("Allowed by bypass"), result);
}

console.log("\nlifecycle (state isolation and cleanup)");

{
  const c = setup(dashOn());
  assertBlocked("the first agent records its reply confirmation", run(CHECK_REPLY, event(c)));
  assertBlocked("a second agent does not confirm the first agent reply", run(CHECK_REPLY, event(c, { agent_id: "agent-b" })));
  const result = run(CHECK_REPLY, event(c));
  check("the first agent retains its own pending confirmation", !result.decision && result.systemMessage?.includes("Kept after confirmation"), result);
}

{
  const c = setup({ ...dashOn({ mode: "deny" }), maxRetries: 1 });
  const agents = ["agent-a", "agent-b", "agent-c"];
  const first = await Promise.all(agents.map((agent_id) => runAsync(CHECK_REPLY, event(c, { agent_id }))));
  first.forEach((result, index) => assertBlocked(`${agents[index]} starts with its own reply counter`, result));
  const second = await Promise.all(agents.map((agent_id) => runAsync(CHECK_REPLY, event(c, { agent_id }))));
  second.forEach((result, index) => check(`${agents[index]} reaches its own retry limit`, !result.decision && result.systemMessage?.includes("Allowed through after 1 nudges"), result));
  assertBlocked("the parent reply has an independent counter", run(CHECK_REPLY, { ...event(c), hook_event_name: "Stop", agent_id: undefined }));
}

{
  const c = setup({ maxCommentLines: 1, maxRetries: 1 });
  sessions.add(c.sid);
  const input = writeEvent(c, "note.ts", "// first line\n// second line\n");
  for (const agent_id of ["agent-a", "agent-b"]) {
    assertDenied("core write checks isolate agent counters", run(CHECK_EDIT, { ...input, agent_id }));
  }
  const second = run(CHECK_EDIT, { ...input, agent_id: "agent-a" });
  check("the first agent reaches its core retry limit", !second.hookSpecificOutput?.permissionDecision && second.systemMessage?.includes("Allowed through"), second);
  assertDenied("the parent core counter remains fresh", run(CHECK_EDIT, input));
}

{
  const c = setup({});
  const other = `${c.sid}-other`;
  sessions.add(other);
  for (const agent_id of [undefined, "agent-a", "agent-b"]) {
    withStateScope({ agent_id }, () => bumpAttempt(c.sid, "test"));
  }
  bumpAttempt(other, "test");
  const start = Date.now();
  const result = run(SESSION_END, { cwd: c.dir, session_id: c.sid, hook_event_name: "SessionEnd" }, { BEC_CONFIG_JSON: "{broken", BEC_MONITOR_DISABLED: "1" });
  assertEmpty("SessionEnd finishes without recreating config warning state", result);
  check("SessionEnd removes all agents in its session", !existsSync(dirname(statePath(c.sid))), statePath(c.sid));
  check("SessionEnd preserves another session", existsSync(statePath(other)), statePath(other));
  check("SessionEnd exits within the host timeout", Date.now() - start < 1000, Date.now() - start);
  check("cleanup does not select a default session for missing ids", cleanupSession(undefined) === false, null);
  const unsafe = `${c.sid}/../../escape`;
  bumpAttempt(unsafe, "test");
  check("state identifiers stay within hashed path components", /^[0-9a-f]{64}$/.test(dirname(statePath(unsafe)).split("/").at(-1)), statePath(unsafe));
  check("cleanup accepts safely encoded session ids", cleanupSession(unsafe), unsafe);
}

console.log("\nlifecycle (monitor delivery)");

{
  const c = setup({});
  const env = { HOME: c.dir, XDG_CONFIG_HOME: join(c.dir, "config"), XDG_STATE_HOME: join(c.dir, "state"), XDG_CACHE_HOME: join(c.dir, "cache"), BEC_MONITOR_DISABLED: "0" };
  const fixture = join(c.dir, "event-hook.mjs");
  writeFileSync(fixture, `import { runHook } from ${JSON.stringify(new URL("../hooks/lib/hook-main.mjs", import.meta.url).href)};\nawait runHook({ hook: "lifecycle-contract", event: "PreToolUse" }, () => ({ systemMessage: "[concise] context" }));\n`);
  for (const hook_event_name of ["SessionStart", "SubagentStart", "UserPromptSubmit", "PostToolUse"]) {
    const result = run(fixture, event(c, { hook_event_name }), env);
    check(`${hook_event_name} uses the input event for context delivery`, result.hookSpecificOutput?.hookEventName === hook_event_name, result);
  }
  run(CHECK_REPLY, event(c, { last_assistant_message: "Clean reply." }), env);
  run(SESSION_END, { cwd: c.dir, session_id: c.sid, hook_event_name: "SessionEnd" }, env);
  const records = readFileSync(recordsPath(c.dir, env), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  check("the monitor receives all lifecycle events", records.map((record) => record.event).join(",") === "SessionStart,SubagentStart,UserPromptSubmit,PostToolUse,SubagentStop,SessionEnd", records.map((record) => record.event));
  check("monitor sessions retain the host session id", records.every((record) => record.session === c.sid && record.request.session_id === c.sid), records.map((record) => record.session));
  check("the monitor retains the agent id on agent events", records.slice(0, -1).every((record) => record.request.agent_id === "agent-a"), records.map((record) => record.request.agent_id));
}

for (const session of sessions) cleanupSession(session);
cleanup();
