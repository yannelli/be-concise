import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, CHECK_BASH, CHECK_EDIT, CHECK_REPLY, ok, bad, withConfig, assertDenied } from "./lib.mjs";
import { EM } from "./features-lib.mjs";
import { listProjects } from "../hooks/lib/projects.mjs";
import { cleanupSession } from "../hooks/lib/state.mjs";

const MONITOR_FILTER = join(ROOT, "hooks", "monitor-filter.mjs");
const SESSION_CONTEXT = join(ROOT, "hooks", "session-context.mjs");
const SESSION_END = join(ROOT, "hooks", "session-end.mjs");
const HOOK_MAIN = pathToFileURL(join(ROOT, "hooks", "lib", "hook-main.mjs")).href;
const HOST_VARS = ["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"];
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !HOST_VARS.includes(key)));
const dirs = [];
const sids = [];
let seq = 0;
const show = (value) => JSON.stringify(value).slice(0, 400);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual)));

function tempDir(config) {
  const dir = mkdtempSync(join(tmpdir(), "concise-cov-entry-"));
  dirs.push(dir);
  if (config) withConfig(dir, config);
  return dir;
}

function hook(script, input, { env = {}, cwd, raw } = {}) {
  const res = spawnSync(process.execPath, [script], {
    input: raw ?? JSON.stringify(input),
    encoding: "utf8",
    cwd: cwd || tempDir(),
    env: { ...BASE_ENV, BEC_MONITOR_DISABLED: "1", ...env },
  });
  if (res.status !== 0) throw new Error(`${script} exited ${res.status}: ${res.stderr}`);
  return JSON.parse(res.stdout || "{}");
}

const run = (script, input) => hook(script, input, { cwd: input.cwd });
const sid = () => {
  sids.push(`cov-entry-${process.pid}-${++seq}`);
  return sids.at(-1);
};
const isEmpty = (result) => JSON.stringify(result) === "{}";
const textOf = (result) => result.reason || result.systemMessage || result.hookSpecificOutput?.permissionDecisionReason || "";
const readLog = (path) => readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const dashOn = { features: { emDash: { enabled: true } } };

function jsonl(dir, name, entries) {
  const path = join(dir, name);
  writeFileSync(path, `${entries.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).join("\n")}\n`);
  return path;
}

const stop = (dir, extra) => ({ hook_event_name: "Stop", session_id: sid(), cwd: dir, ...extra });

console.log("\ncoverage: check-reply transcript shapes");

{
  const dir = tempDir(dashOn);
  const codex = jsonl(dir, "codex.jsonl", [{ type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: `Done ${EM} codex.` }] } }]);
  check("a Codex payload record supplies the reply", run(CHECK_REPLY, stop(dir, { transcript_path: codex })).decision === "block", null);
  const flat = jsonl(dir, "flat.jsonl", [{ role: "assistant", content: `Done ${EM} flat.` }]);
  check("a bare record with string content supplies the reply", run(CHECK_REPLY, stop(dir, { transcript_path: flat })).decision === "block", null);
  const mixed = jsonl(dir, "mixed.jsonl", [
    { role: "assistant", payload: { content: [{ type: "output_text", text: `Done ${EM} outer role.` }] } },
    "not json",
    { message: { role: "assistant" } },
    { message: { role: "user", content: "next" } },
    "",
  ]);
  const result = run(CHECK_REPLY, stop(dir, { transcript_path: mixed }));
  check("the scan skips user, empty, and unparsable records to the last assistant text", result.decision === "block" && textOf(result).includes("outer role"), result);
  const userOnly = jsonl(dir, "user.jsonl", [{ message: { role: "user", content: `Hi ${EM} there.` } }]);
  check("a transcript with no assistant text allows", isEmpty(run(CHECK_REPLY, stop(dir, { transcript_path: userOnly }))), null);
}

{
  const dir = tempDir(dashOn);
  const filler = JSON.stringify({ message: { role: "user", content: "x".repeat(1024 * 1024 + 10) } });
  const big = jsonl(dir, "big.jsonl", [filler, { message: { role: "assistant", content: `Done ${EM} clipped.` } }]);
  const result = run(CHECK_REPLY, stop(dir, { transcript_path: big }));
  check("a transcript over 1 MiB is read from its tail", result.decision === "block" && textOf(result).includes("clipped"), result);
}

console.log("\ncoverage: check-reply events");

{
  const dir = tempDir({ ...dashOn, bypass: { phrases: ["ship-it-anyway"] } });
  const handback = (message) => ({ hook_event_name: "PreToolUse", tool_name: "SubagentHandback", tool_input: { message }, session_id: sid(), cwd: dir, agent_type: "Explore" });
  check("an empty handback message allows", isEmpty(run(CHECK_REPLY, handback(""))), null);
  check("a non-string handback message allows", isEmpty(run(CHECK_REPLY, handback(5))), null);
  const bypassed = run(CHECK_REPLY, handback(`Report ${EM} ship-it-anyway.`));
  check("a handback with a bypass phrase is allowed with a notice", bypassed.systemMessage?.includes('Allowed by bypass phrase "ship-it-anyway"'), bypassed);
}

{
  const dir = tempDir(dashOn);
  const noEvent = run(CHECK_REPLY, { session_id: sid(), cwd: dir, last_assistant_message: `Done ${EM} default.` });
  check("an event without hook_event_name is treated as Stop", noEvent.decision === "block", noEvent);
  const other = run(CHECK_REPLY, { hook_event_name: "PostToolUse", tool_name: "Bash", session_id: sid(), cwd: dir, last_assistant_message: `Done ${EM}.` });
  check("an event other than Stop or SubagentStop allows", isEmpty(other), other);
}

console.log("\ncoverage: check-edit inputs");

{
  const dir = tempDir();
  const event = (tool_name, tool_input) => ({ tool_name, tool_input, cwd: dir, session_id: sid() });
  const file = join(dir, "a.ts");
  check("a Write without content allows", isEmpty(run(CHECK_EDIT, event("Write", { file_path: file }))), null);
  check("an Edit without new_string allows", isEmpty(run(CHECK_EDIT, event("Edit", { file_path: file }))), null);
  check("a MultiEdit without edits allows", isEmpty(run(CHECK_EDIT, event("MultiEdit", { file_path: file }))), null);
  check("a MultiEdit edit without new_string allows", isEmpty(run(CHECK_EDIT, event("MultiEdit", { file_path: file, edits: [{}] }))), null);
  check("a Write without tool_input allows", isEmpty(run(CHECK_EDIT, { tool_name: "Write", cwd: dir, session_id: sid() })), null);
  check("an empty apply_patch allows", isEmpty(run(CHECK_EDIT, event("apply_patch", {}))), null);
  const patch = "*** Begin Patch\n*** Add File: long.ts\n+// 1\n+// 2\n+// 3\n+// 4\n*** End Patch";
  const viaInput = run(CHECK_EDIT, event("apply_patch", { input: patch }));
  assertDenied("apply_patch reads the patch from tool_input.input", viaInput);
  const noCwd = hook(CHECK_EDIT, { tool_name: "apply_patch", tool_input: { command: patch }, session_id: sid() }, { cwd: dir });
  check("a patch path without cwd resolves against the process cwd", textOf(noCwd).includes(`${realpathSync(dir)}/long.ts:1`), noCwd);
}

console.log("\ncoverage: check-bash inputs");

{
  const dir = tempDir({ ...dashOn, bypass: { phrases: ["let-it-pass"] } });
  const bash = (tool_input, tool_name = "Bash") => ({ tool_name, tool_input, cwd: dir, session_id: sid() });
  check("a tool other than Bash allows", isEmpty(run(CHECK_BASH, bash({ command: "git commit -m x" }, "Read"))), null);
  check("a Bash call without tool_input allows", isEmpty(run(CHECK_BASH, { tool_name: "Bash", cwd: dir, session_id: sid() })), null);
  const issue = run(CHECK_BASH, bash({ command: `gh issue create --title t --body "Short ${EM} body."` }));
  check("a gh issue body is labeled issue body", textOf(issue).includes("in issue body"), issue);
  const bypassed = run(CHECK_BASH, bash({ command: `git commit -m "Fix ${EM} let-it-pass"` }));
  check("a commit with a bypass phrase is allowed with a notice", bypassed.systemMessage?.includes("Allowed by bypass phrase"), bypassed);
}

console.log("\ncoverage: monitor-filter");

{
  const dir = tempDir({ bypass: { phrases: ["skip-filter"] } });
  const log = join(dir, "log.jsonl");
  const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "pytest skip-filter" }, cwd: dir, session_id: sid() };
  const result = hook(MONITOR_FILTER, input, { env: { BEC_LOG_ENABLED: "1", BEC_LOG_PATH: log } });
  check("a bypass phrase leaves the command unfiltered", isEmpty(result), result);
  check("the bypass is logged as the decision", readLog(log)[0].decision === "bypass", readLog(log));
}

{
  const dir = tempDir();
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "bash"), '#!/bin/sh\ncat >/dev/null\ncase "$FAKE_MODE" in\n  fail) echo boom >&2; exit 3;;\n  silent) exit 4;;\nesac\nexit 0\n');
  chmodSync(join(bin, "bash"), 0o755);
  const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "pytest" }, cwd: dir, session_id: sid() };
  const path = `${bin}:${process.env.PATH}`;
  const failed = hook(MONITOR_FILTER, input, { env: { PATH: path, FAKE_MODE: "fail" } });
  check("a filter script that fails reports its stderr and allows", failed.systemMessage === "[concise] internal error, allowing: boom", failed);
  const silent = hook(MONITOR_FILTER, input, { env: { PATH: path, FAKE_MODE: "silent" } });
  check("a filter script that fails silently reports its exit code", silent.systemMessage === "[concise] internal error, allowing: Bash exited 4", silent);
  check("a filter script with empty stdout allows", isEmpty(hook(MONITOR_FILTER, input, { env: { PATH: path } })), null);
  const missing = hook(MONITOR_FILTER, input, { env: { PATH: join(dir, "nothing") } });
  check("a missing bash reports the spawn error and allows", /internal error, allowing: .*ENOENT/.test(missing.systemMessage || ""), missing);
}

console.log("\ncoverage: session-context");

{
  const dir = tempDir({ context: { enabled: true, perTurn: true } });
  const start = hook(SESSION_CONTEXT, { cwd: dir, session_id: sid() });
  check("an event without hook_event_name is treated as SessionStart", start.hookSpecificOutput?.hookEventName === "SessionStart"
    && start.hookSpecificOutput.additionalContext.startsWith("[concise] Active rules:"), start);
  check("an unrelated event adds no context", isEmpty(hook(SESSION_CONTEXT, { hook_event_name: "Stop", cwd: dir, session_id: sid() })), null);
  const turn = hook(SESSION_CONTEXT, { hook_event_name: "UserPromptSubmit", cwd: dir, session_id: sid() });
  check("a prompt event without a prompt still adds context", turn.hookSpecificOutput?.additionalContext?.startsWith("[concise] Active rules:"), turn);
}

console.log("\ncoverage: runHook");

{
  const dir = tempDir();
  const log = join(dir, "log.jsonl");
  const result = hook(SESSION_END, null, { raw: "{bad", cwd: dir, env: { BEC_LOG_ENABLED: "1", BEC_LOG_PATH: log } });
  check("invalid stdin JSON reports an internal error and allows", result.systemMessage?.startsWith("[concise] internal error, allowing:"), result);
  const [entry] = readLog(log);
  check("the parse error is logged with null input fields", entry.decision === "error" && entry.tool === null && entry.session === null
    && entry.cwd === null && entry.event === "SessionEnd" && entry.error, entry);
  check("empty stdin is read as an empty event", isEmpty(hook(SESSION_END, null, { raw: "" })), null);
}

{
  const result = hook(SESSION_END, { cwd: 123, session_id: sid() }, { env: { BEC_MONITOR_DISABLED: "" } });
  check("a cwd that breaks config loading still allows", isEmpty(result), result);
  const early = hook(CHECK_BASH, { tool_name: "Read", cwd: 123, session_id: sid() });
  check("a hook that bails before config with a broken cwd allows", isEmpty(early), early);
}

{
  const dir = tempDir({ softFail: true, bypass: { phrases: ["keep-it"] } });
  const result = run(CHECK_EDIT, { tool_name: "Write", tool_input: { file_path: join(dir, "a.md"), content: "keep-it" }, cwd: dir, session_id: sid() });
  check("soft fail keeps a flag result unchanged", result.systemMessage === '[concise] Allowed by bypass phrase "keep-it"', result);
}

{
  const dir = tempDir();
  const env = { BEC_MONITOR_DISABLED: "", XDG_CONFIG_HOME: join(dir, "config"), XDG_STATE_HOME: join(dir, "state") };
  check("an event without cwd allows", isEmpty(hook(SESSION_END, { session_id: sid() }, { cwd: dir, env })), null);
  const projects = listProjects(env);
  check("an event without cwd is recorded under the process cwd", projects.length === 1 && projects[0].cwd === realpathSync(dir), projects);
}

{
  const dir = tempDir();
  const log = join(dir, "log.jsonl");
  const probe = join(dir, "probe.mjs");
  writeFileSync(probe, `import { runHook } from ${JSON.stringify(HOOK_MAIN)};
await runHook({ hook: "probe" }, (input, ctx) => {
  ctx.config = { log: { enabled: true, path: process.env.PROBE_LOG } };
});
`);
  const result = hook(probe, { session_id: sid() }, { cwd: dir, env: { PROBE_LOG: log } });
  check("a decide that returns nothing allows", isEmpty(result), result);
  const [entry] = readLog(log);
  check("a hook without an event logs null event and mode", entry.hook === "probe" && entry.event === null && entry.mode === null && entry.decision === "allow", entry);
}

for (const id of sids) cleanupSession(id);
for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
