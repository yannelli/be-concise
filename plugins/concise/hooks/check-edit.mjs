#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, isIgnored } from "./lib/config.mjs";
import { scanComments } from "./lib/comment-scan.mjs";
import { extractPatch, parseApplyPatch } from "./lib/apply-patch.mjs";
import { bumpAttempt, resetAttempt } from "./lib/state.mjs";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

const EDIT_TOOLS = ["Write", "Edit", "MultiEdit"];

// Only the text this call writes, so a one-line edit isn't blamed for what's already
// on disk. Chunks stay separate: joining them could invent a comment run.
function writtenChunks(toolName, toolInput) {
  if (toolName === "Write") return [toolInput.content || ""];
  if (toolName === "Edit") return [toolInput.new_string || ""];
  return (toolInput.edits || []).map((edit) => edit.new_string || "");
}

// Claude Code sends Write/Edit/MultiEdit; Codex sends apply_patch (or a shell heredoc
// carrying one). Both become { path, chunks, wholeFile } targets.
function targetsOf(input) {
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  if (EDIT_TOOLS.includes(toolName)) {
    if (!toolInput.file_path) return [];
    return [{ path: toolInput.file_path, chunks: writtenChunks(toolName, toolInput), wholeFile: toolName === "Write" }];
  }

  let patch = null;
  if (toolName === "apply_patch") patch = toolInput.command || toolInput.input || "";
  if (toolName === "Bash") patch = extractPatch(toolInput.command);
  if (!patch) return [];

  return parseApplyPatch(patch).map((file) => ({
    path: resolve(input.cwd || ".", file.path),
    chunks: file.chunks,
    wholeFile: file.kind === "add",
  }));
}

function hasFileMarker(filePath) {
  try {
    return readFileSync(filePath, "utf8").includes("concise-ignore-file");
  } catch {
    return false;
  }
}

function firstLineOf(text) {
  return text.split("\n")[0].trim().slice(0, 60);
}

function checkTarget({ path, chunks, wholeFile }, config) {
  if (isIgnored(path, config.ignoreGlobs)) return [];

  const exempt = chunks.some((chunk) => chunk.includes("concise-ignore-file"));
  // A whole-file write replaces the file, so its new content is the only authority on the marker.
  if (exempt || (!wholeFile && hasFileMarker(path))) return [];

  const violations = [];

  for (const chunk of chunks) {
    const longRun = scanComments(chunk, path).find(
      (run) => run.length > config.maxCommentLines && !run.text.includes("concise-ignore"),
    );
    if (!longRun) continue;
    const where = wholeFile ? `${path}:${longRun.startLine}` : `${path}, starting "${firstLineOf(longRun.text)}"`;
    violations.push(
      `Comment at ${where} is ${longRun.length} lines (limit ${config.maxCommentLines}). Trim it to the one non-obvious point, or put "concise-ignore" inside it if it is a genuine exception.`,
    );
    break;
  }

  if (wholeFile) {
    const lineCount = chunks[0].split("\n").length;
    if (lineCount > config.maxFileLines) {
      violations.push(
        `${path} would be ${lineCount} lines (limit ${config.maxFileLines}). Split it up, or put a "concise-ignore-file" marker near the top if it has to be this size.`,
      );
    }
  }

  return violations;
}

// Claude Code shows systemMessage to the user; Codex drops it, so the same text also
// goes to the model as additionalContext.
function flagged(text) {
  return {
    systemMessage: text,
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: text },
  };
}

function decide(input) {
  const targets = targetsOf(input);
  if (targets.length === 0) return {};

  const config = loadConfig(input.cwd);
  const violations = [];
  let key = null;

  for (const target of targets) {
    const found = checkTarget(target, config);
    if (found.length === 0) {
      resetAttempt(input.session_id, target.path);
      continue;
    }
    key = key || target.path;
    violations.push(...found);
  }

  if (violations.length === 0) return {};

  const attempt = bumpAttempt(input.session_id, key);
  const message = `[concise] ${violations.join(" ")}`;

  if (attempt > config.maxRetries) {
    // Reset on the way out, so the next episode nudges again instead of being exempt.
    resetAttempt(input.session_id, key);
    return flagged(`${message}\n\n(Allowed through after ${config.maxRetries} nudges, flagging for manual review.)`);
  }

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: message,
    },
  };
}

const raw = await readStdin();
let result = {};
try {
  result = decide(JSON.parse(raw || "{}"));
} catch (err) {
  // A hook bug must never block real work.
  result = { systemMessage: `[concise] internal error, allowing: ${err.message}` };
}
// No process.exit: a piped stdout writes asynchronously on macOS and would truncate.
process.stdout.write(JSON.stringify(result));
