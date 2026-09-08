import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withConfig, ok, bad } from "./lib.mjs";
import { statePath } from "../hooks/lib/state.mjs";

export const EM = "—";
export const EN = "–";

const dirs = [];
let seq = 0;

/** One tmp dir with its own .claude/concise.json and its own session id per case. */
export function setup(config) {
  const dir = mkdtempSync(join(tmpdir(), "concise-feat-"));
  dirs.push(dir);
  withConfig(dir, config);
  seq += 1;
  return { dir, sid: `feat-${process.pid}-${seq}` };
}

export function cleanup() {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

export const dashOn = (extra = {}) => ({ features: { emDash: { enabled: true, ...extra } } });
export const aiOn = (extra = {}) => ({ features: { aiWriting: { enabled: true, ...extra } } });
export const bothOn = (dash = {}, ai = {}) => ({
  features: { emDash: { enabled: true, ...dash }, aiWriting: { enabled: true, ...ai } },
});

export const writeEvent = ({ dir, sid }, name, content) => ({
  tool_name: "Write",
  tool_input: { file_path: join(dir, name), content },
  cwd: dir,
  session_id: sid,
});

export const fileWriteEvent = ({ dir, sid }, path) => ({
  tool_name: "Write",
  tool_input: { file_path: path, content: readFileSync(path, "utf8") },
  cwd: dir,
  session_id: sid,
});

export const editEvent = ({ dir, sid }, name, newString) => ({
  tool_name: "Edit",
  tool_input: { file_path: join(dir, name), old_string: "x", new_string: newString },
  cwd: dir,
  session_id: sid,
});

export const bashEvent = ({ dir, sid }, command) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd: dir,
  session_id: sid,
});

export const patchEvent = ({ dir, sid }, patch) => ({
  tool_name: "apply_patch",
  tool_input: { command: patch },
  cwd: dir,
  session_id: sid,
});

export const stopEvent = ({ dir, sid }, transcriptPath, active) => ({
  hook_event_name: "Stop",
  session_id: sid,
  transcript_path: transcriptPath,
  cwd: dir,
  stop_hook_active: Boolean(active),
});

/** A transcript tail in the Claude Code shape: JSON per line, text blocks inside message.content. */
export function transcript({ dir }, name, text) {
  const path = join(dir, name);
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "go" }] } }),
    JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "thinking" }, { type: "text", text }] },
    }),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

export const reasonOf = (result) =>
  result.hookSpecificOutput?.permissionDecisionReason || result.reason || result.systemMessage || "";

export function includes(name, result, needle) {
  if (reasonOf(result).includes(needle)) return ok(name);
  bad(name, `expected ${JSON.stringify(needle)} in ${JSON.stringify(reasonOf(result)).slice(0, 300)}`);
}

export function assertEmpty(name, result) {
  if (JSON.stringify(result) === "{}") return ok(name);
  bad(name, `expected {}, got ${JSON.stringify(result)}`);
}

export function assertAsked(name, result) {
  const out = result.hookSpecificOutput || {};
  if (out.permissionDecision === "ask" && out.permissionDecisionReason) return ok(name);
  bad(name, `expected an ask, got ${JSON.stringify(result)}`);
}

export function assertBlocked(name, result) {
  if (result.decision !== "block") return bad(name, `expected a block, got ${JSON.stringify(result)}`);
  if (!reasonOf(result).includes("[concise]")) return bad(name, "block is missing a reason");
  ok(name);
}

export function assertNoBlock(name, result) {
  if (result.decision) return bad(name, `expected no decision, got ${JSON.stringify(result)}`);
  ok(name);
}

export function assertNoPending(name, sid) {
  const path = statePath(sid);
  const state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const keys = Object.keys(state).filter((key) => key.startsWith("pending:"));
  if (keys.length === 0) return ok(name);
  bad(name, `expected no pending hash, found ${keys.join(", ")}`);
}

export function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "assets" || entry.name === "node_modules") return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
