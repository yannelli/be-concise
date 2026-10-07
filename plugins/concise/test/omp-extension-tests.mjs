import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, bad, withConfig } from "./lib.mjs";
import { EM } from "./features-lib.mjs";
import concise, { createConcise, runHook } from "../omp/extension.mjs";

const HOOKS = fileURLToPath(new URL("../hooks/", import.meta.url));
const show = (value) => JSON.stringify(value)?.slice(0, 400);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual)));
const dirs = [];
let seq = 0;

function tempDir(config) {
  const dir = mkdtempSync(join(tmpdir(), "concise-omp-"));
  dirs.push(dir);
  if (config) withConfig(dir, config);
  return dir;
}

function bind(factory) {
  const handlers = {};
  factory({ on: (event, handler) => (handlers[event] = handler), setLabel: () => {} });
  return handlers;
}

function context(cwd, extra = {}) {
  const notes = [];
  const sid = `omp-test-${process.pid}-${++seq}`;
  const ctx = {
    cwd,
    hasUI: false,
    ui: { notify: (text, level) => notes.push([level, text]) },
    sessionManager: { getSessionId: () => sid },
    agent: { kind: "main", id: "Main", name: "main" },
    ...extra,
  };
  return { ctx, notes };
}

async function rejects(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error.message;
  }
}

console.log("\nomp: runHook");

{
  const dir = tempDir();
  const script = (name, body) => {
    writeFileSync(join(dir, `${name}.mjs`), body);
    return relative(HOOKS, join(dir, name));
  };
  check("a hook's JSON output resolves", show(await runHook("session-end", { session_id: "x" }, { cwd: dir })) === "{}", null);
  const missing = await rejects(runHook("no-such-hook", {}, { cwd: dir }));
  check("a non-zero exit rejects", missing?.includes("no-such-hook exited 1"), missing);
  const noisy = await rejects(runHook(script("noisy", "console.log('not json');"), {}, { cwd: dir }));
  check("non-JSON output rejects", noisy?.includes("printed invalid JSON"), noisy);
  const slow = await rejects(runHook(script("slow", "setTimeout(() => {}, 5000);"), {}, { cwd: dir, timeoutMs: 50 }));
  check("a slow hook times out", slow?.includes("timed out after 50 ms"), slow);
  const lost = await rejects(runHook("session-end", {}, { cwd: join(dir, "missing") }));
  check("a spawn failure rejects", Boolean(lost), lost);
}

console.log("\nomp: extension against the real hooks");

{
  const dir = tempDir({ softFail: false });
  const handlers = bind(concise);
  const { ctx } = context(dir);
  const long = "// one\n// two\n// three\n// four\n// five\nexport const x = 1;\n";
  const write = await handlers.tool_call({ toolName: "write", input: { path: "long.ts", content: long } }, ctx);
  check("a write with a long comment is blocked", write?.block && write.reason.includes("[concise] Comment at"), write);
  const hashline = `*** Begin Patch\n[a.ts#1A2B]\nPUT >1:\n${long.trim().split("\n").map((line) => `+${line}`).join("\n")}\n*** End Patch`;
  const edit = await handlers.tool_call({ toolName: "edit", input: { input: hashline, path: "a.ts" } }, ctx);
  check("a hashline edit with a long comment is blocked", edit?.block && edit.reason.includes("a.ts"), edit);
  const short = await handlers.tool_call({ toolName: "write", input: { path: "short.ts", content: "// one\n" } }, ctx);
  check("a short write is allowed", short === undefined, short);
  const body = "This is a long paragraph of prose about the change with several sentences in a row explaining everything at length.\n\nAnd here is a second unrelated paragraph continuing to explain more things in prose form as well.";
  const pr = await handlers.tool_call({ toolName: "bash", input: { command: `gh pr create --title t --body "${body}"` } }, ctx);
  check("a verbose PR body is blocked", pr?.block && pr.reason.includes("PR/issue body"), pr);
  const test = await handlers.tool_call({ toolName: "bash", input: { command: "npm test", timeout: 60 } }, ctx);
  check("a test command is wrapped by the output filter", test?.input?.command.includes("PreToolUse-test-filter.sh") && test.input.timeout === 60, test);
  check("an unrelated bash command runs no hooks", (await handlers.tool_call({ toolName: "bash", input: {} }, ctx)) === undefined, null);
  check("an unrelated tool runs no hooks", (await handlers.tool_call({ toolName: "read", input: { path: "a" } }, ctx)) === undefined, null);
  const rules = await handlers.before_agent_start({ prompt: "hi" }, ctx);
  check("the first prompt carries the active rules", rules?.message?.content.includes("[concise] Active rules") && rules.message.display === false, rules);
  await handlers.session_shutdown({}, ctx);
}

{
  const dir = tempDir({ features: { emDash: { enabled: true } } });
  const handlers = bind(concise);
  const { ctx } = context(dir);
  const reply = { role: "assistant", content: [{ type: "text", text: `A reply ${EM} with a dash.` }] };
  const held = await handlers.session_stop({ last_assistant_message: reply, session_id: ctx.sessionManager.getSessionId(), stop_hook_active: false }, ctx);
  check("a reply with an em dash is held", held?.decision === "block" && held.reason.includes("[concise]"), held);
}

console.log("\nomp: extension decisions");

function fake(responses) {
  const calls = [];
  const run = async (name, input) => {
    calls.push([name, input]);
    const response = responses[name];
    if (response instanceof Error) throw response;
    return response || {};
  };
  return { calls, handlers: bind(createConcise({ run })) };
}

const askResult = { systemMessage: "[concise] asked", hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "[concise] keep it?", additionalContext: "[concise] keep it?" } };
const writeEvent = { toolName: "write", input: { path: "a.ts", content: "x" } };

{
  const { handlers } = fake({ "check-edit": askResult });
  const { ctx } = context("/w");
  const result = await handlers.tool_call(writeEvent, ctx);
  check("ask without a UI blocks with a way forward", result?.block && result.reason.includes("cannot show an approval prompt"), result);
  const approve = context("/w", { hasUI: true, ui: { confirm: async () => true, notify: () => { throw new Error("no"); } } });
  check("ask approved in the UI allows the call", (await handlers.tool_call(writeEvent, approve.ctx)) === undefined, null);
  const decline = context("/w", { hasUI: true, ui: { confirm: async () => false } });
  const declined = await handlers.tool_call(writeEvent, decline.ctx);
  check("ask declined in the UI blocks", declined?.block && declined.reason.includes("declined"), declined);
}

{
  const deny = { hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "[concise] no" } };
  const { handlers } = fake({ "check-bash": deny, "check-edit": askResult, "monitor-filter": { systemMessage: "[concise] note" } });
  const { ctx, notes } = context("/w");
  const result = await handlers.tool_call({ toolName: "bash", input: { command: "git commit\n*** Begin Patch" } }, ctx);
  check("a deny wins over an ask", result?.block && result.reason === "[concise] no", result);
  check("a hook notice reaches the UI", notes.some(([level, text]) => level === "info" && text === "[concise] note"), notes);
}

{
  const { handlers } = fake({ "check-edit": new Error("boom") });
  const { ctx, notes } = context("/w", { sessionManager: undefined });
  check("a failed hook allows the call", (await handlers.tool_call(writeEvent, ctx)) === undefined, null);
  check("a failed hook warns in the UI", notes.some(([level, text]) => level === "warning" && text.includes("check-edit failed, allowing: boom")), notes);
}

{
  const { calls, handlers } = fake({ "session-context": { systemMessage: "[concise] rules" } });
  const main = context("/w", { sessionManager: undefined });
  await handlers.before_agent_start({ prompt: "one" }, main.ctx);
  await handlers.before_agent_start({ prompt: "two" }, main.ctx);
  handlers.session_compact();
  await handlers.before_agent_start({ prompt: "three" }, main.ctx);
  handlers.session_switch();
  const sub = context("/w", { agent: { kind: "sub", id: "0-Explore", name: "explore" } });
  const result = await handlers.before_agent_start({ prompt: "four" }, sub.ctx);
  const events = calls.map(([, input]) => input.hook_event_name);
  check("rules load at start, per prompt, and again after a compaction", show(events) === show(["SessionStart", "UserPromptSubmit", "SessionStart", "SubagentStart"]), events);
  check("a prompt rides along on UserPromptSubmit", calls[1][1].prompt === "two" && calls[0][1].session_id === "omp", calls);
  check("a subagent gets its own retry state", calls[3][1].agent_id === "0-Explore" && calls[3][1].agent_type === "explore", calls[3]);
  check("a notice becomes the rules message", result?.message?.content === "[concise] rules", result);
}

{
  const { handlers } = fake({});
  const { ctx } = context("/w");
  check("no rules means no message", (await handlers.before_agent_start({ prompt: "x" }, ctx)) === undefined, null);
}

{
  const { calls, handlers } = fake({ "check-reply": { systemMessage: "[concise] Reply still has 1 em dash; allowed." } });
  const { ctx, notes } = context("/w");
  check("a stop with no reply text is skipped", (await handlers.session_stop({ messages: [] }, ctx)) === undefined && calls.length === 0, calls);
  const allowed = await handlers.session_stop({ messages: [{ role: "assistant", content: "fine" }], stop_hook_active: true }, ctx);
  check("an allowed reply finishes the turn", allowed === undefined && notes.length === 1, notes);
  const input = calls[0][1];
  check("the stop input carries the reply and the session", input.last_assistant_message === "fine" && input.stop_hook_active === true && input.session_id === ctx.sessionManager.getSessionId(), input);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
