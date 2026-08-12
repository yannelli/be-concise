#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadConfig, isIgnored } from "./lib/config.mjs";
import { scanComments } from "./lib/comment-scan.mjs";
import { bumpAttempt } from "./lib/state.mjs";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

function decide(input) {
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path;
  if (!filePath || !["Write", "Edit", "MultiEdit"].includes(toolName)) return {};

  const config = loadConfig(input.cwd);
  if (isIgnored(filePath, config.ignoreGlobs)) return {};

  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return {};
  }
  if (content.includes("concise-ignore-file")) return {};

  const violations = [];

  const longRun = scanComments(content, filePath).find(
    (run) => run.length > config.maxCommentLines && !run.text.includes("concise-ignore"),
  );
  if (longRun) {
    violations.push(
      `Comment at ${filePath}:${longRun.startLine} is ${longRun.length} lines (limit ${config.maxCommentLines}). Trim it to the one non-obvious point, or add "concise-ignore" inside it if it's a genuine exception.`,
    );
  }

  const lineCount = content.split("\n").length;
  if (lineCount > config.maxFileLines) {
    violations.push(
      `${filePath} is ${lineCount} lines (limit ${config.maxFileLines}). Split it up, or add a "concise-ignore-file" marker near the top if it has to be this size.`,
    );
  }

  if (violations.length === 0) return {};

  const attempt = bumpAttempt(input.session_id, filePath);
  const message = `[concise] ${violations.join(" ")}`;

  if (attempt > config.maxRetries) {
    return {
      systemMessage: `${message}\n\n(Allowed through after ${config.maxRetries} nudges — flagging for manual review.)`,
    };
  }

  return {
    hookSpecificOutput: { hookEventName: "PostToolUse", permissionDecision: "deny" },
    systemMessage: message,
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
process.stdout.write(JSON.stringify(result));
process.exit(0);
