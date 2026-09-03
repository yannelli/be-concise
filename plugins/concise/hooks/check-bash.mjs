#!/usr/bin/env node
import { createHash } from "node:crypto";
import { loadConfig } from "./lib/config.mjs";
import { extractBody, isVerbose } from "./lib/pr-body.mjs";
import { gitCommitMessages } from "./lib/prose.mjs";
import { bumpAttempt, resetAttempt } from "./lib/state.mjs";
import { deny, mergeFlag } from "./lib/respond.mjs";
import { styleDecisionForText } from "./lib/style-check.mjs";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

const GH_PATTERN = /\bgh\s+(pr|issue)\s+(create|comment|edit)\b/;

const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

// Keyed on the command minus its body, so revisions of the same PR share a counter
// while an unrelated PR later in the session starts fresh.
const scaffoldHash = (command, bodies) => shortHash(bodies.reduce((acc, body) => acc.replace(body, ""), command));

function ghDecision(command, input, config) {
  const body = extractBody(command);
  if (!body || body.includes("concise-ignore")) return {};

  const digest = scaffoldHash(command, [body]);
  const key = `pr-body:${digest}`;
  const label = /\bgh\s+issue\b/.test(command) ? "issue body" : "PR body";
  const styled = () => styleDecisionForText(body, `style:gh:${digest}`, label, input, config);

  const result = isVerbose(body, {
    maxParagraphs: config.maxPrBodyParagraphs,
    maxSentences: config.maxPrBodySentences,
  });
  if (!result.verbose) {
    resetAttempt(input.session_id, key);
    return styled();
  }

  const attempt = bumpAttempt(input.session_id, key);
  const message = `[concise] PR/issue body is too verbose: ${result.reason}. Use a short "## Summary" bullet list instead of prose paragraphs.`;
  if (attempt <= config.maxRetries) return deny(message);

  // Reset on the way out, so the next episode nudges again instead of being exempt.
  resetAttempt(input.session_id, key);
  const flagText = `${message}\n\n(Allowed through after ${config.maxRetries} nudges, flagging for manual review.)`;
  return mergeFlag(flagText, styled());
}

function commitDecision(command, messages, input, config) {
  const text = messages.join("\n\n");
  if (text.includes("concise-ignore")) return {};
  return styleDecisionForText(text, `style:commit:${scaffoldHash(command, messages)}`, "commit message", input, config);
}

function decide(input) {
  if (input.tool_name !== "Bash") return {};
  const command = (input.tool_input || {}).command || "";
  if (GH_PATTERN.test(command)) return ghDecision(command, input, loadConfig(input.cwd));

  const messages = gitCommitMessages(command);
  if (messages.length === 0) return {};
  return commitDecision(command, messages, input, loadConfig(input.cwd));
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
