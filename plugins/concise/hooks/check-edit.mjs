#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadConfig, isIgnored } from "./lib/config.mjs";
import { scanComments } from "./lib/comment-scan.mjs";
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

function decide(input) {
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path;
  if (!filePath || !EDIT_TOOLS.includes(toolName)) return {};

  const config = loadConfig(input.cwd);
  if (isIgnored(filePath, config.ignoreGlobs)) return {};

  const chunks = writtenChunks(toolName, toolInput);
  const exempt = chunks.some((chunk) => chunk.includes("concise-ignore-file"));
  // A Write replaces the file, so its new content is the only authority on the marker.
  if (exempt || (toolName !== "Write" && hasFileMarker(filePath))) return {};

  const violations = [];

  for (const chunk of chunks) {
    const longRun = scanComments(chunk, filePath).find(
      (run) => run.length > config.maxCommentLines && !run.text.includes("concise-ignore"),
    );
    if (!longRun) continue;
    const where =
      toolName === "Write" ? `${filePath}:${longRun.startLine}` : `${filePath}, starting "${firstLineOf(longRun.text)}"`;
    violations.push(
      `Comment at ${where} is ${longRun.length} lines (limit ${config.maxCommentLines}). Trim it to the one non-obvious point, or put "concise-ignore" inside it if it is a genuine exception.`,
    );
    break;
  }

  if (toolName === "Write") {
    const lineCount = chunks[0].split("\n").length;
    if (lineCount > config.maxFileLines) {
      violations.push(
        `${filePath} would be ${lineCount} lines (limit ${config.maxFileLines}). Split it up, or put a "concise-ignore-file" marker near the top if it has to be this size.`,
      );
    }
  }

  if (violations.length === 0) {
    resetAttempt(input.session_id, filePath);
    return {};
  }

  const attempt = bumpAttempt(input.session_id, filePath);
  const message = `[concise] ${violations.join(" ")}`;

  if (attempt > config.maxRetries) {
    // Reset on the way out, so the next episode nudges again instead of being exempt.
    resetAttempt(input.session_id, filePath);
    return {
      systemMessage: `${message}\n\n(Allowed through after ${config.maxRetries} nudges, flagging for manual review.)`,
    };
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
