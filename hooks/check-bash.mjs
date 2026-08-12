#!/usr/bin/env node
import { loadConfig } from "./lib/config.mjs";
import { extractBody, isVerbose } from "./lib/pr-body.mjs";
import { bumpAttempt } from "./lib/state.mjs";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

const GH_PATTERN = /\bgh\s+(pr|issue)\s+(create|comment|edit)\b/;

function decide(input) {
  if (input.tool_name !== "Bash") return {};
  const command = (input.tool_input || {}).command || "";
  if (!GH_PATTERN.test(command)) return {};

  const body = extractBody(command);
  if (!body || body.includes("concise-ignore")) return {};

  const config = loadConfig(input.cwd);
  const result = isVerbose(body, {
    maxParagraphs: config.maxPrBodyParagraphs,
    maxSentences: config.maxPrBodySentences,
  });
  if (!result.verbose) return {};

  const attempt = bumpAttempt(input.session_id, "pr-body");
  const message = `[concise] PR/issue body is too verbose: ${result.reason}. Use a short "## Summary" bullet list instead of prose paragraphs.`;

  if (attempt > config.maxRetries) {
    return {
      systemMessage: `${message}\n\n(Allowed through after ${config.maxRetries} nudges — flagging for manual review.)`,
    };
  }

  return {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" },
    systemMessage: message,
  };
}

const raw = await readStdin();
let result = {};
try {
  result = decide(JSON.parse(raw || "{}"));
} catch (err) {
  result = { systemMessage: `[concise] internal error, allowing: ${err.message}` };
}
process.stdout.write(JSON.stringify(result));
process.exit(0);
