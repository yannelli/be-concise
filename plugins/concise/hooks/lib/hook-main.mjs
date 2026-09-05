import { flagged } from "./respond.mjs";
import { loadConfig } from "./config.mjs";
import { createLogger, softFailResult } from "./log.mjs";
import { once } from "./state.mjs";
import { styleLog } from "./style-check.mjs";
import { STOP_BLOCK_MESSAGE } from "./confirm.mjs";
import { publishMonitor } from "./monitor.mjs";

export function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

const asTexts = (texts) => (Array.isArray(texts) ? texts : [texts]).map((text) => String(text ?? ""));

function safeRegExp(source) {
  try {
    return new RegExp(String(source), "i");
  } catch {
    return null;
  }
}

/** The phrase or pattern that exempts this call, or null. */
export function bypassMatch(texts, config) {
  const rules = (config || {}).bypass || {};
  const list = asTexts(texts);
  for (const phrase of rules.phrases || []) {
    const needle = String(phrase).toLowerCase();
    if (needle && list.some((text) => text.toLowerCase().includes(needle))) return String(phrase);
  }
  for (const source of rules.patterns || []) {
    const re = safeRegExp(source);
    if (re && list.some((text) => re.test(text))) return String(source);
  }
  return null;
}

export function bypassResult(texts, config, ctx, event = "PreToolUse") {
  const match = bypassMatch(texts, config);
  if (!match) return null;
  if (ctx) ctx.decision = "bypass";
  const text = `[concise] Allowed by bypass phrase "${match}"`;
  return event === "Stop" ? { systemMessage: text } : flagged(text);
}

function withMessage(result, text) {
  if (!text) return result;
  return { ...result, systemMessage: result.systemMessage ? `${result.systemMessage} ${text}` : text };
}

function configWarnings(config, sessionId) {
  const out = [];
  for (const problem of (config || {}).problems || []) {
    if (!once(sessionId, `warned:config:${problem.source}`)) continue;
    out.push(`[concise] config ignored: ${problem.source} (${problem.reason})`);
  }
  return out.join(" ");
}

// A deny or block carries pack warnings in systemMessage, and softFailResult rewrites that field.
function withSoftFail(result, config) {
  if (!config?.softFail) return result;
  return withMessage(softFailResult(result), carriedWarnings(result));
}

function carriedWarnings(result) {
  if (decisionOf(result) === "flag") return "";
  const text = result.systemMessage || "";
  return text.startsWith(STOP_BLOCK_MESSAGE) ? text.slice(STOP_BLOCK_MESSAGE.length).trim() : text;
}

function decisionOf(result) {
  const permission = result?.hookSpecificOutput?.permissionDecision;
  if (permission === "deny" || permission === "ask") return permission;
  if (result?.decision === "block") return "block";
  if (result?.systemMessage || result?.hookSpecificOutput?.additionalContext) return "flag";
  return "allow";
}

/** A hook that bailed before it read its config still logs and still reports config problems. */
function fallbackConfig(cwd) {
  try {
    return loadConfig(cwd);
  } catch {
    return null;
  }
}

function logRun({ hook, event, input, ctx, config, result, error, started }) {
  const logger = createLogger((config || {}).log, { hook });
  if (!logger.enabled) return;
  const style = styleLog();
  logger.record({
    event: input.hook_event_name || event || null,
    tool: input.tool_name ?? null,
    session: input.session_id ?? null,
    cwd: input.cwd ?? null,
    key: ctx.key || style.key,
    scope: style.scope || style.lastScope,
    decision: error ? "error" : ctx.decision || decisionOf(result),
    mode: config?.features?.aiWriting?.mode ?? null,
    softFail: Boolean(config?.softFail),
    findings: style.findings,
    counts: style.counts,
    durationMs: Date.now() - started,
    error,
  });
}

/** Reads the event, runs decide, applies soft fail and logging, writes the hook JSON. */
export async function runHook({ hook, event }, decide) {
  const started = Date.now();
  const ctx = { config: null, key: null, decision: null };
  const raw = await readStdin();
  let input = {};
  let result = {};
  let error = null;
  try {
    input = JSON.parse(raw || "{}");
    result = (await decide(input, ctx)) || {};
  } catch (err) {
    error = err.message;
    result = { systemMessage: `[concise] internal error, allowing: ${error}` };
  }
  result = withSoftFail(result, ctx.config);
  const config = ctx.config || fallbackConfig(input.cwd);
  result = withMessage(result, configWarnings(config, input.session_id));
  logRun({ hook, event, input, ctx, config, result, error, started });
  const style = styleLog();
  await publishMonitor({
    ts: new Date().toISOString(),
    hook,
    event: input.hook_event_name || event || null,
    tool: input.tool_name ?? null,
    session: input.session_id ?? null,
    cwd: input.cwd || process.cwd(),
    decision: error ? "error" : ctx.decision || decisionOf(result),
    durationMs: Date.now() - started,
    findings: style.findings,
    counts: style.counts,
    error,
    request: input,
    response: result,
    source: "live",
  }, { persist: config?.monitor?.persist !== false });
  // No process.exit: a piped stdout writes asynchronously on macOS and would truncate.
  process.stdout.write(JSON.stringify(result));
}
