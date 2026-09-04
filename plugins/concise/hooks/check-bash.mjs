#!/usr/bin/env node
import { createHash } from "node:crypto";
import { loadConfig } from "./lib/config.mjs";
import { extractBody, isVerbose } from "./lib/pr-body.mjs";
import { gitCommitMessages } from "./lib/prose.mjs";
import { bumpAttempt, resetAttempt } from "./lib/state.mjs";
import { deny, mergeFlag } from "./lib/respond.mjs";
import { styleDecisionForText, prepareStyle, withPackWarnings } from "./lib/style-check.mjs";
import { runHook, bypassResult } from "./lib/hook-main.mjs";

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
  const styled = () => styleDecisionForText(body, `style:gh:${digest}`, label, input, config, "PreToolUse", "gh");

  const off = (config.checks || {}).prBody === false;
  const result = off
    ? { verbose: false }
    : isVerbose(body, { maxParagraphs: config.maxPrBodyParagraphs, maxSentences: config.maxPrBodySentences });
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
  const key = `style:commit:${scaffoldHash(command, messages)}`;
  return styleDecisionForText(text, key, "commit message", input, config, "PreToolUse", "commit");
}

// Packs scoped to `command` also see the flags and trailers around the message.
function commandDecision(command, input, config) {
  if (command.includes("concise-ignore")) return {};
  const key = `style:command:${shortHash(command)}`;
  return styleDecisionForText(command, key, "command", input, config, "PreToolUse", "command");
}

function combine(...results) {
  const decided = results.find((r) => r.hookSpecificOutput?.permissionDecision || r.decision);
  return decided || results.find((r) => Object.keys(r).length > 0) || {};
}

async function decide(input, ctx) {
  if (input.tool_name !== "Bash") return {};
  const command = (input.tool_input || {}).command || "";
  const isGh = GH_PATTERN.test(command);
  const messages = isGh ? [] : gitCommitMessages(command);
  if (!isGh && messages.length === 0) return {};

  const config = loadConfig(input.cwd);
  ctx.config = config;
  const bypassed = bypassResult(command, config, ctx);
  if (bypassed) return bypassed;
  await prepareStyle(input.cwd, config);
  const main = isGh ? ghDecision(command, input, config) : commitDecision(command, messages, input, config);
  return withPackWarnings(combine(main, commandDecision(command, input, config)), input.session_id);
}

await runHook({ hook: "check-bash", event: "PreToolUse" }, decide);
