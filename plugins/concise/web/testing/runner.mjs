import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, defaultConfig } from "../../hooks/lib/config.mjs";
import { applyLayer } from "../../hooks/lib/config-layers.mjs";
import { validateFilter } from "../configuration.mjs";
import { runProcess } from "./process.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, "../..");
const sessions = new Map();
const INPUT_LIMIT = 1024 * 1024;
const KNOWN = new Map([
  ['node "${CLAUDE_PLUGIN_ROOT}/hooks/check-edit.mjs"', { name: "check-edit", worker: true }],
  ['node "${CLAUDE_PLUGIN_ROOT}/hooks/check-bash.mjs"', { name: "check-bash", worker: true }],
  ['node "${CLAUDE_PLUGIN_ROOT}/hooks/check-reply.mjs"', { name: "check-reply", worker: true }],
  ['node "${CLAUDE_PLUGIN_ROOT}/hooks/monitor-filter.mjs"', { name: "test-filter", file: "monitor-filter.mjs" }],
  ['bash "${CLAUDE_PLUGIN_ROOT}/hooks/PreToolUse-test-filter.sh"', { name: "test-filter", file: "PreToolUse-test-filter.sh", shell: true }],
]);

async function getSession(id) {
  if (id !== undefined && id !== null && id !== "") {
    if (typeof id !== "string" || !sessions.has(id)) throw new Error("Unknown playground session; start a new session");
    return sessions.get(id);
  }
  if (sessions.size >= 64) throw new Error("Playground session limit reached; restart the console");
  const session = { id: randomUUID(), directory: null, queue: Promise.resolve() };
  sessions.set(session.id, session);
  try {
    session.directory = await mkdtemp(join(tmpdir(), "concise-playground-"));
    return session;
  } catch (error) {
    sessions.delete(session.id);
    throw error;
  }
}

function environment(env, directory, configPath) {
  const out = Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/^(BEC_|FILTER_|TF_)/.test(key) && ![
      "HOME", "USERPROFILE", "XDG_CONFIG_HOME", "TMPDIR", "TMP", "TEMP", "NODE_OPTIONS", "NODE_PATH",
      "ENV", "BASH_ENV", "SHELLOPTS", "BASHOPTS", "NOFILTER",
    ].includes(key)));
  const home = join(directory, "home");
  const state = join(directory, "state");
  return { ...out, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"),
    TMPDIR: state, TMP: state, TEMP: state, BEC_CONFIG_PATH: configPath,
    BEC_MONITOR_DISABLED: "1", CLAUDE_PLUGIN_ROOT: PLUGIN };
}

async function requestOf(options, session, cwd) {
  const { kind = "Write", text = "", path = "example.md", event, stopHookActive = false } = options;
  if (typeof text !== "string" || typeof path !== "string") throw new Error("Text and path must be strings");
  const filePath = resolve(cwd, path);
  let request;
  if (kind === "raw") {
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Raw event must be an object");
    request = structuredClone(event);
  } else if (kind === "Stop") request = { hook_event_name: "Stop", stop_hook_active: Boolean(stopHookActive) };
  else {
    const inputs = {
      Write: { file_path: filePath, content: text },
      Edit: { file_path: filePath, old_string: "", new_string: text },
      MultiEdit: { file_path: filePath, edits: [{ old_string: "", new_string: text }] },
      apply_patch: { command: text },
      Bash: { command: text },
    };
    if (!Object.hasOwn(inputs, kind)) throw new Error(`Unsupported playground tool: ${kind}`);
    request = { hook_event_name: "PreToolUse", tool_name: kind, tool_input: inputs[kind] };
  }
  request.cwd = cwd;
  request.session_id = session.id;
  request.hook_event_name ||= request.tool_name ? "PreToolUse" : "Stop";
  if (!["PreToolUse", "Stop"].includes(request.hook_event_name)) throw new Error("Unsupported hook event");
  if (request.hook_event_name === "Stop") {
    const reply = kind === "raw" ? request.last_assistant_message : text;
    if (typeof reply !== "string") throw new Error("Raw Stop events require last_assistant_message; use Stop to paste a reply");
    request.transcript_path = join(session.directory, "transcript.jsonl");
    await writeFile(request.transcript_path, `${JSON.stringify({ message: {
      role: "assistant", content: [{ type: "text", text: reply }],
    } })}\n`, { mode: 0o600 });
  }
  return request;
}

async function applicable(request) {
  const manifest = JSON.parse(await readFile(join(PLUGIN, "hooks/hooks.json"), "utf8"));
  const hooks = [];
  for (const group of manifest.hooks[request.hook_event_name] || []) {
    if (group.matcher && !new RegExp(`^(?:${group.matcher})$`).test(request.tool_name || "")) continue;
    for (const hook of group.hooks || []) {
      if (hook.type !== "command" || !KNOWN.has(hook.command)) throw new Error(`Unsupported hook command: ${hook.command}`);
      hooks.push(KNOWN.get(hook.command));
    }
  }
  return hooks;
}

function decision(response) {
  const permission = response.hookSpecificOutput?.permissionDecision;
  if (permission === "deny" || permission === "ask") return permission;
  if (response.decision === "block") return "block";
  if (response.hookSpecificOutput?.updatedInput) return "rewrite";
  const message = response.systemMessage || response.hookSpecificOutput?.additionalContext;
  if (message?.includes("Allowed by bypass phrase")) return "bypass";
  if (message) return "flag";
  return "allow";
}

async function copyFilterConfig(env, directory) {
  const home = env.HOME || env.USERPROFILE;
  for (const host of [".claude", ".codex"]) {
    const target = join(directory, "home", host);
    await rm(join(target, "test-filter.conf"), { force: true });
    if (!home) continue;
    let text;
    try {
      text = await readFile(join(home, host, "test-filter.conf"), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    validateFilter(text);
    await mkdir(target, { recursive: true, mode: 0o700 });
    await writeFile(join(target, "test-filter.conf"), text, { mode: 0o600 });
  }
}

async function execute(hook, request, requestPath, env) {
  const command = hook.shell ? "bash" : process.execPath;
  const args = hook.worker ? [join(HERE, "worker.mjs"), hook.name, requestPath] : [join(PLUGIN, "hooks", hook.file)];
  const result = await runProcess(command, args, { input: JSON.stringify(request), cwd: request.cwd, env });
  let response = {};
  let metadata = {};
  try {
    response = JSON.parse(result.stdout.trim());
    if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error("Expected a JSON object");
  } catch (error) {
    response = {};
    result.error ||= `Invalid hook response: ${error.message}`;
  }
  try {
    if (result.metadata) metadata = JSON.parse(result.metadata);
  } catch (error) {
    result.error ||= `Invalid match diagnostics: ${error.message}`;
  }
  result.error ||= metadata.error || (response.systemMessage?.startsWith("[concise] internal error") ? response.systemMessage : null);
  const findings = (metadata.style?.findings || []).map((hit) => ({ ...hit,
    fix: metadata.matches?.find((match) => match.category === hit.category && match.line === hit.line)?.fix ?? null,
  }));
  return { matches: metadata.matches || [], record: {
    hook: hook.name, event: request.hook_event_name, tool: request.tool_name ?? null,
    session: request.session_id, cwd: request.cwd, decision: result.error ? "error" : decision(response),
    durationMs: result.durationMs, findings, counts: metadata.style?.counts || { emDash: 0, aiWriting: 0 },
    error: result.error, request, response, stdout: result.stdout, stderr: result.stderr,
    exitCode: result.exitCode, source: "test",
  } };
}

async function perform(options, session) {
  const cwd = resolve(options.cwd || process.cwd());
  const env = options.env || process.env;
  if (options.reset) await rm(session.directory, { recursive: true, force: true });
  await Promise.all(["home", "state"].map((name) => mkdir(join(session.directory, name), { recursive: true, mode: 0o700 })));
  const config = options.config === undefined ? loadConfig(cwd, env) : applyLayer(defaultConfig(), structuredClone(options.config));
  const configPath = join(session.directory, "concise.json");
  const snapshot = { ...config, log: { ...config.log, path: join(session.directory, "hook.log") } };
  const request = await requestOf(options, session, cwd);
  const serialized = JSON.stringify(request);
  if (Buffer.byteLength(serialized) > INPUT_LIMIT) throw new Error("Test input exceeds 1 MiB");
  const requestPath = join(session.directory, "request.json");
  await writeFile(configPath, JSON.stringify(snapshot), { mode: 0o600 });
  await writeFile(requestPath, serialized, { mode: 0o600 });
  if (request.tool_name === "Bash") await copyFilterConfig(env, session.directory);
  const hooks = [];
  const matches = [];
  for (const hook of await applicable(request)) {
    const result = await execute(hook, request, requestPath, environment(env, session.directory, configPath));
    hooks.push(result.record);
    matches.push(...result.matches);
  }
  return { session: session.id, request, hooks, matches, config };
}

export async function runTest(options = {}) {
  if (typeof options.text === "string" && Buffer.byteLength(options.text) > INPUT_LIMIT) throw new Error("Test input exceeds 1 MiB");
  const session = await getSession(options.session);
  const result = session.queue.then(() => perform(options, session));
  session.queue = result.catch(() => {});
  return result;
}

export async function disposeTests() {
  const existing = [...sessions.values()];
  sessions.clear();
  await Promise.all(existing.map(async (session) => {
    await session.queue;
    if (session.directory) await rm(session.directory, { recursive: true, force: true });
  }));
}
