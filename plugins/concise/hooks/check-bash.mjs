#!/usr/bin/env node
import { createHash } from "node:crypto";
import { loadConfig } from "./lib/config.mjs";
import { extractBody, isVerbose } from "./lib/pr-body.mjs";
import { bumpAttempt, resetAttempt } from "./lib/state.mjs";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

const GH_PATTERN = /\bgh\s+(pr|issue)\s+(create|comment|edit)\b/;

// Keyed on the command minus its body, so revisions of the same PR share a counter
// while an unrelated PR later in the session starts fresh.
function attemptKey(command, body) {
  const scaffolding = command.replace(body, "");
  return `pr-body:${createHash("sha256").update(scaffolding).digest("hex").slice(0, 12)}`;
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
  if (input.tool_name !== "Bash") return {};
  const command = (input.tool_input || {}).command || "";
  if (!GH_PATTERN.test(command)) return {};

  const body = extractBody(command);
  if (!body || body.includes("concise-ignore")) return {};

  const key = attemptKey(command, body);
  const config = loadConfig(input.cwd);
  const result = isVerbose(body, {
    maxParagraphs: config.maxPrBodyParagraphs,
    maxSentences: config.maxPrBodySentences,
  });
  if (!result.verbose) {
    resetAttempt(input.session_id, key);
    return {};
  }

  const attempt = bumpAttempt(input.session_id, key);
  const message = `[concise] PR/issue body is too verbose: ${result.reason}. Use a short "## Summary" bullet list instead of prose paragraphs.`;

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
  result = { systemMessage: `[concise] internal error, allowing: ${err.message}` };
}
// No process.exit: a piped stdout writes asynchronously on macOS and would truncate.
process.stdout.write(JSON.stringify(result));
