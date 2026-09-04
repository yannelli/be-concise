#!/usr/bin/env node
import { openSync, readSync, fstatSync, closeSync } from "node:fs";
import { loadConfig } from "./lib/config.mjs";
import { styleFindings, styleSummary, styleDecisionForText, prepareStyle, withPackWarnings } from "./lib/style-check.mjs";
import { sha256 } from "./lib/confirm.mjs";
import { takePending, resetAttempt } from "./lib/state.mjs";
import { runHook, bypassResult } from "./lib/hook-main.mjs";

const KEY = "style:reply";
const REPLY_PATH = "reply.md";
const TAIL_BYTES = 1024 * 1024;

function readTail(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    return { text: buffer.toString("utf8"), clipped: length < size };
  } finally {
    closeSync(fd);
  }
}

function textOf(entry) {
  const message = entry?.message || entry;
  if ((message?.role || entry?.role) !== "assistant") return null;
  const block = (message?.content || []).find((part) => part?.type === "text" && typeof part.text === "string");
  return block ? block.text : null;
}

function lastAssistantText(path) {
  const tail = readTail(path);
  const lines = tail.text.split("\n");
  // The first line of a clipped read starts mid-record, so it can never parse as JSON.
  if (tail.clipped) lines.shift();
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() === "") continue;
    let text = null;
    try {
      text = textOf(JSON.parse(lines[i]));
    } catch {
      continue;
    }
    if (text !== null) return text;
  }
  return null;
}

// A feature that is off for replies is off for this hook, so styleFindings skips it.
function replyConfig(config) {
  const { emDash, aiWriting } = config.features;
  return {
    ...config,
    ignoreGlobs: [],
    styleIgnoreGlobs: [],
    features: {
      emDash: { ...emDash, enabled: Boolean(emDash.enabled && emDash.replies) },
      aiWriting: { ...aiWriting, enabled: Boolean(aiWriting.enabled && aiWriting.replies) },
    },
  };
}

function afterBlock(text, input, config) {
  const summary = styleSummary(styleFindings(text, REPLY_PATH, config, "reply"), null);
  const pending = takePending(input.session_id, KEY);
  resetAttempt(input.session_id, KEY);
  if (!summary) return {};
  if (pending === sha256(text)) return { systemMessage: `[concise] Kept after confirmation: ${summary} in your reply` };
  return { systemMessage: `[concise] Reply still has ${summary}; allowed.` };
}

async function decide(input, ctx) {
  const config = replyConfig(loadConfig(input.cwd));
  ctx.config = config;
  if (!config.stopHook) return {};
  if (!config.features.emDash.enabled && !config.features.aiWriting.enabled) return {};
  if (!input.transcript_path) return {};

  let text = null;
  try {
    text = lastAssistantText(input.transcript_path);
  } catch {
    return {};
  }
  if (text === null) return {};

  const bypassed = bypassResult(text, config, ctx, "Stop");
  if (bypassed) return bypassed;
  await prepareStyle(input.cwd, config);
  const result = input.stop_hook_active
    ? afterBlock(text, input, config)
    : styleDecisionForText(text, KEY, "your reply", input, config, "Stop", "reply");
  return withPackWarnings(result, input.session_id);
}

await runHook({ hook: "check-reply", event: "Stop" }, decide);
