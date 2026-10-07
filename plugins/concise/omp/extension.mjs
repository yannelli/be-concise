import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { contextOf, editCall, replyText, toolCallResult } from "./translate.mjs";

const HOOKS = fileURLToPath(new URL("../hooks/", import.meta.url));
const TIMEOUT_MS = 15000;
// The same cheap gates as the `if` conditions in hooks/hooks.json.
const BASH_HOOKS = [["monitor-filter", "t"], ["check-bash", "g"], ["check-edit", "Begin Patch"]];
const NO_PROMPT = "omp cannot show an approval prompt in this mode. Revise the flagged text, or ask the user to approve keeping it. After approval, retry with concise-ignore.";

/** Runs one hook script with the event on stdin and resolves its JSON output. */
export function runHook(name, input, { cwd, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((done, fail) => {
    // omp runs under Bun, where process.execPath is the omp binary rather than Node.
    const child = spawn("node", [`${HOOKS}${name}.mjs`], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error(`${name} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return fail(new Error(`${name} exited ${code}: ${stderr.trim()}`));
      try {
        done(JSON.parse(stdout || "{}"));
      } catch {
        fail(new Error(`${name} printed invalid JSON`));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

function notify(ctx, text, level = "info") {
  try {
    ctx.ui?.notify?.(text, level);
  } catch {}
}

function baseInput(ctx, event) {
  const input = { hook_event_name: event, session_id: ctx.sessionManager?.getSessionId?.() || "omp", cwd: ctx.cwd };
  if (ctx.agent?.kind === "sub") Object.assign(input, { agent_id: ctx.agent.id, agent_type: ctx.agent.name });
  return input;
}

function toolHooks(event, ctx) {
  const input = baseInput(ctx, "PreToolUse");
  if (event.toolName === "bash") {
    const command = typeof event.input?.command === "string" ? event.input.command : "";
    const hookInput = { ...input, tool_name: "Bash", tool_input: { command } };
    return BASH_HOOKS.filter(([, needle]) => command.includes(needle)).map(([name]) => [name, hookInput]);
  }
  const call = editCall(event.toolName, event.input, ctx.cwd);
  return call ? [["check-edit", { ...input, ...call }]] : [];
}

const isAsk = (result) => result.hookSpecificOutput?.permissionDecision === "ask";

/** Builds the omp extension; tests pass their own `run` in place of spawning Node. */
export function createConcise({ run = runHook } = {}) {
  return function concise(pi) {
    let started = false;

    // Concise fails open: omp blocks a tool call whose handler throws.
    async function call(ctx, name, input, options = {}) {
      try {
        const result = await run(name, input, { cwd: ctx.cwd, ...options });
        if (result.systemMessage) notify(ctx, result.systemMessage);
        return result;
      } catch (error) {
        notify(ctx, `[concise] ${name} failed, allowing: ${error.message}`, "warning");
        return {};
      }
    }

    pi.setLabel?.("Concise");

    pi.on("tool_call", async (event, ctx) => {
      const hooks = toolHooks(event, ctx);
      if (hooks.length === 0) return undefined;
      const results = await Promise.all(hooks.map(([name, input]) => call(ctx, name, input)));
      const asked = results.find(isAsk);
      const merged = toolCallResult(results.filter((result) => result !== asked), event.input);
      if (!asked || merged?.block) return merged;
      const reason = asked.hookSpecificOutput.permissionDecisionReason;
      if (!ctx.hasUI) return { block: true, reason: `${reason}\n\n${NO_PROMPT}` };
      if (await ctx.ui.confirm("concise", reason)) return merged;
      return { block: true, reason: `${reason}\n\nThe user declined this call.` };
    });

    pi.on("before_agent_start", async (event, ctx) => {
      const name = started ? "UserPromptSubmit" : ctx.agent?.kind === "sub" ? "SubagentStart" : "SessionStart";
      started = true;
      const input = { ...baseInput(ctx, name), ...(name === "UserPromptSubmit" ? { prompt: event.prompt } : {}) };
      const text = contextOf(await call(ctx, "session-context", input));
      return text ? { message: { customType: "concise", content: text, display: false } } : undefined;
    });

    const restart = () => {
      started = false;
    };
    pi.on("session_switch", restart);
    pi.on("session_compact", restart);

    pi.on("session_stop", async (event, ctx) => {
      const text = replyText(event);
      if (text === null) return undefined;
      const input = { ...baseInput(ctx, "Stop"), stop_hook_active: Boolean(event.stop_hook_active), last_assistant_message: text };
      if (event.session_id) input.session_id = event.session_id;
      const result = await call(ctx, "check-reply", input);
      return result.decision === "block" ? { decision: "block", reason: result.reason } : undefined;
    });

    pi.on("session_shutdown", async (_event, ctx) => {
      await call(ctx, "session-end", baseInput(ctx, "SessionEnd"), { timeoutMs: 1500 });
    });
  };
}

export default createConcise();
