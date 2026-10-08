#!/usr/bin/env node
import { createHash } from "node:crypto";
import { loadConfig } from "./lib/config.mjs";
import { GH_COMMAND, apiFields, extractBody, extractTitle, isVerbose, maskHeredocs } from "./lib/pr-body.mjs";
import { gitCommitMessages } from "./lib/prose.mjs";
import { bumpAttempt, resetAttempt } from "./lib/state.mjs";
import { ask, deny, mergeFlag } from "./lib/respond.mjs";
import { styleDecisionForText, prepareStyle, withPackWarnings } from "./lib/style-check.mjs";
import { runHook, bypassResult } from "./lib/hook-main.mjs";

// Release notes and merge-commit bodies get the style check but not the PR prose limit.
const PROSE_LIMITED = /\bgh\s+(?:pr|issue)\s+(?:create|comment|edit|review)\b/;
const SHELL_TOOLS = ["Bash", "PowerShell"];

const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

// Keyed on the command minus its heredocs and the texts a check reads, so revisions share a counter.
// Longest first, so a title repeated inside the body can't spoil the body's removal.
const scaffoldHash = (command, texts) =>
  shortHash(texts.filter(Boolean).sort((a, b) => b.length - a.length).reduce((acc, text) => acc.replace(text, ""), maskHeredocs(command).masked));

function labelOf(command, part) {
  const kind = /\bgh\s+release\b/.test(command) ? "release" : /\bgh\s+issue\b/.test(command) ? "issue" : "PR";
  if (part === "title") return /\bgh\s+pr\s+merge\b/.test(command) ? "merge subject" : `${kind} title`;
  return kind === "release" ? "release notes" : `${kind} body`;
}

function textDecision(texts, key, label, scope, input, config) {
  const text = texts.filter(Boolean).join("\n\n");
  if (!text || text.includes("concise-ignore")) return {};
  return styleDecisionForText(text, key, label, input, config, "PreToolUse", scope, "bash");
}

// The title and body are scanned apart, so line numbers and whole-text packs see each as written,
// and one held call carries both reasons, so one round fixes both.
function joined(results, input) {
  const held = results.filter((r) => r.hookSpecificOutput?.permissionDecisionReason);
  if (held.length < 2) return combine(...results);
  const reason = held.map((r) => r.hookSpecificOutput.permissionDecisionReason).join("\n\n");
  return held.some((r) => r.hookSpecificOutput.permissionDecision === "deny") ? deny(reason) : ask(reason, input);
}

function ghDecision(command, input, config) {
  const body = extractBody(command, input.cwd);
  const title = extractTitle(command);
  if (!(title || body) || [title, body].join("\n").includes("concise-ignore")) return {};

  const digest = scaffoldHash(command, [title, body]);
  const styled = () => joined([
    textDecision([title], `style:gh-title:${digest}`, labelOf(command, "title"), "gh", input, config),
    textDecision([body], `style:gh:${digest}`, labelOf(command, "body"), "gh", input, config),
  ], input);

  // The prose limit reads only the body, so its counter keeps the title in the key.
  const key = `pr-body:${scaffoldHash(command, [body])}`;
  const off = !body || (config.checks || {}).prBody === false || !PROSE_LIMITED.test(command);
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

// Packs scoped to `command` also see the flags and trailers around the message.
function commandDecision(command, input, config) {
  if (command.includes("concise-ignore")) return {};
  const key = `style:command:${shortHash(command)}`;
  return styleDecisionForText(command, key, "command", input, config, "PreToolUse", "command", "bash");
}

function combine(...results) {
  const decided = results.find((r) => r.hookSpecificOutput?.permissionDecision || r.decision);
  return decided || results.find((r) => Object.keys(r).length > 0) || {};
}

async function decide(input, ctx) {
  if (!SHELL_TOOLS.includes(input.tool_name)) return {};
  const command = (input.tool_input || {}).command || "";
  const isGh = GH_COMMAND.test(command);
  const fields = isGh ? [] : apiFields(command, input.cwd);
  const messages = isGh ? [] : gitCommitMessages(command, input.cwd);
  if (!isGh && fields.length + messages.length === 0) return {};

  const config = loadConfig(input.cwd);
  ctx.config = config;
  const bypassed = bypassResult(command, config, ctx);
  if (bypassed) return bypassed;
  await prepareStyle(input.cwd, config);
  const main = isGh
    ? [ghDecision(command, input, config)]
    : [
        textDecision(fields, `style:api:${scaffoldHash(command, fields)}`, "API request body", "gh", input, config),
        textDecision(messages, `style:commit:${scaffoldHash(command, messages)}`, "commit message", "commit", input, config),
      ];
  return withPackWarnings(combine(...main, commandDecision(command, input, config)), input.session_id);
}

// `*g*` and `jj *` both match a jj command that holds a "g".
const overlaps = (input) => /\bjj\s/.test(input.tool_input?.command || "");

await runHook({ hook: "check-bash", event: "PreToolUse", overlaps }, decide);
