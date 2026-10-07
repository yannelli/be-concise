import { resolve } from "node:path";

const PATCH_FILE = /^\*\*\* (Add|Update|Delete) File: /m;
const SLOPPY_FILE = /^\*\*\* Edit File:/m;
const HASHLINE_HEADER = /^\[(.+)#[0-9A-Fa-f]{4}\]\s*$/;
const SLOPPY_HEADER = /^\*\*\* (Edit File:|Find|Replace|Insert Before|Insert After)\s*(.*)$/;
const URL_PATH = /^[a-z][a-z0-9+.-]*:\/\//i;

const unquote = (text) => {
  const value = text.trim();
  if (/^".*"$/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return /^'.*'$/.test(value) ? value.slice(1, -1) : value;
};

const linesOf = (text) => String(text ?? "").split("\n").map((line) => line.replace(/\r$/, ""));

/** Returns the edited targets of a hashline payload: `[path#TAG]` sections with `+` body rows. */
export function hashlineTargets(text) {
  const files = [];
  let current = null;
  let run = [];
  const flush = () => {
    if (current && run.length) current.chunks.push(run.join("\n"));
    run = [];
  };
  for (const line of linesOf(text)) {
    const header = HASHLINE_HEADER.exec(line);
    if (header) {
      flush();
      current = { path: header[1].trim(), chunks: [], removed: false };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+")) {
      run.push(line.slice(1));
      continue;
    }
    flush();
    if (/^REM\s*$/.test(line)) current.removed = true;
    const move = /^MV\s+(.+)$/.exec(line);
    if (move) current.path = unquote(move[1]);
  }
  flush();
  return files.filter((file) => !file.removed).map(({ path, chunks }) => ({ path, chunks, wholeFile: false }));
}

/** Returns the targets of a sloppy payload: the Replace and Insert bodies under each `*** Edit File:`. */
export function sloppyTargets(text) {
  const files = [];
  let current = null;
  let body = null;
  const flush = () => {
    if (current && body && body.some((line) => line !== "")) current.chunks.push(body.join("\n"));
    body = null;
  };
  for (const line of linesOf(text)) {
    const header = SLOPPY_HEADER.exec(line);
    if (!header && line.startsWith("*** ")) {
      flush();
      continue;
    }
    if (!header) {
      if (body) body.push(line);
      continue;
    }
    flush();
    if (header[1] !== "Edit File:") {
      body = header[1] === "Find" ? null : [];
      continue;
    }
    const path = unquote(header[2].replace(/\s+all$/, ""));
    if (!path && current) continue;
    current = { path, chunks: [], wholeFile: false };
    files.push(current);
  }
  flush();
  return files.filter((file) => file.path);
}

/** Returns the targets of a patch-mode call: `{ path, edits: [{ op, rename, diff }] }`. */
export function patchModeTargets(input) {
  const path = typeof input.path === "string" ? input.path : "";
  if (!path || !Array.isArray(input.edits)) return [];
  const targets = [];
  for (const edit of input.edits) {
    if (!edit || typeof edit.diff !== "string") continue;
    if (edit.op === "create") {
      targets.push({ path, chunks: [edit.diff], wholeFile: true });
      continue;
    }
    const added = { path: typeof edit.rename === "string" && edit.rename ? edit.rename : path, chunks: [], wholeFile: false };
    let run = [];
    for (const line of [...linesOf(edit.diff), ""]) {
      if (line.startsWith("+") && !line.startsWith("+++ ")) {
        run.push(line.slice(1));
        continue;
      }
      if (run.length) added.chunks.push(run.join("\n"));
      run = [];
    }
    targets.push(added);
  }
  return targets;
}

/** Serializes targets as an apply_patch payload, the shape check-edit already reads from Codex. */
export function patchText(targets) {
  const body = targets.flatMap(({ path, chunks, wholeFile }) => [
    `*** ${wholeFile ? "Add" : "Update"} File: ${path}`,
    ...chunks.flatMap((chunk) => ["@@", ...chunk.split("\n").map((line) => `+${line}`)]),
  ]);
  return ["*** Begin Patch", ...body, "*** End Patch"].join("\n");
}

const asPatch = (targets) => {
  const written = targets.filter((target) => target.chunks.length > 0);
  return written.length ? { tool_name: "apply_patch", tool_input: { input: patchText(written) } } : null;
};

/** Maps an omp write or edit call to the tool name and input check-edit reads, or null. */
export function editCall(toolName, input, cwd) {
  const args = input && typeof input === "object" ? input : {};
  if (toolName === "write") {
    const tagged = HASHLINE_HEADER.exec(String(args.path ?? ""));
    const path = tagged ? tagged[1] : String(args.path ?? "");
    if (!path || URL_PATH.test(path) || typeof args.content !== "string") return null;
    return { tool_name: "Write", tool_input: { file_path: resolve(cwd, path), content: args.content } };
  }
  if (toolName !== "edit" && toolName !== "apply_patch") return null;
  if (typeof args.new_string === "string" && typeof args.path === "string") {
    return { tool_name: "Edit", tool_input: { file_path: resolve(cwd, args.path), old_string: String(args.old_string ?? ""), new_string: args.new_string } };
  }
  if (Array.isArray(args.edits)) return asPatch(patchModeTargets(args));
  const text = typeof args.input === "string" ? args.input : "";
  if (PATCH_FILE.test(text)) return { tool_name: "apply_patch", tool_input: { input: text } };
  return asPatch(SLOPPY_FILE.test(text) ? sloppyTargets(text) : hashlineTargets(text));
}

/** Returns the text blocks of an omp AgentMessage joined by newlines, or null. */
export function messageText(message) {
  if (!message || message.role !== "assistant") return null;
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return null;
  const texts = message.content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text);
  return texts.length ? texts.join("\n") : null;
}

/** The final reply of a session_stop event, or null when it holds no text. */
export function replyText(event) {
  if (event.last_assistant_message) return messageText(event.last_assistant_message);
  const messages = Array.isArray(event.messages) ? event.messages : [];
  return messageText(messages.findLast((message) => message?.role === "assistant"));
}

/** The text a hook result sends to the model: its context, or else its notice. */
export function contextOf(result) {
  return result?.hookSpecificOutput?.additionalContext || result?.systemMessage || "";
}

/** Merges PreToolUse hook results into an omp tool_call result; `ask` is left to the caller. */
export function toolCallResult(results, input) {
  const outputs = results.map((result) => result?.hookSpecificOutput || {});
  const denied = outputs.find((output) => output.permissionDecision === "deny");
  if (denied) return { block: true, reason: denied.permissionDecisionReason || "[concise] denied" };
  const result = {};
  const updated = outputs.find((output) => typeof output.updatedInput?.command === "string");
  if (updated) result.input = { ...input, command: updated.updatedInput.command };
  const context = [...new Set(results.map(contextOf).filter(Boolean))].join("\n\n");
  if (context) result.additionalContext = context;
  return Object.keys(result).length ? result : undefined;
}
