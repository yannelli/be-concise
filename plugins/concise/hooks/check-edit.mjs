#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, isIgnored } from "./lib/config.mjs";
import { scanComments } from "./lib/comment-scan.mjs";
import { extractPatch, parseApplyPatch } from "./lib/apply-patch.mjs";
import { bumpAttempt, resetAttempt } from "./lib/state.mjs";
import { deny, mergeFlag } from "./lib/respond.mjs";
import { styleDecision, prepareStyle, withPackWarnings } from "./lib/style-check.mjs";
import { runHook, bypassResult } from "./lib/hook-main.mjs";

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

// A whole-file write replaces the file, so its new content is the only authority on the marker.
function isExempt({ path, chunks, wholeFile }) {
  if (chunks.some((chunk) => chunk.includes("concise-ignore-file"))) return true;
  return !wholeFile && hasFileMarker(path);
}

function checkTarget(target, config) {
  const { path, chunks, wholeFile } = target;
  if (isIgnored(path, config.ignoreGlobs)) return [];
  if (isExempt(target)) return [];

  const violations = [];
  const checks = config.checks || {};

  for (const chunk of checks.comments === false ? [] : chunks) {
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

  if (wholeFile && checks.fileSize !== false) {
    const lineCount = chunks[0].split("\n").length;
    if (lineCount > config.maxFileLines) {
      violations.push(
        `${path} would be ${lineCount} lines (limit ${config.maxFileLines}). Split it up, or put a "concise-ignore-file" marker near the top if it has to be this size.`,
      );
    }
  }

  return violations;
}

async function decide(input, ctx) {
  const targets = targetsOf(input);
  if (targets.length === 0) return {};
  const config = loadConfig(input.cwd);
  ctx.config = config;
  const bypassed = bypassResult(targets.flatMap((target) => target.chunks), config, ctx);
  if (bypassed) return bypassed;
  await prepareStyle(input.cwd, config);
  return withPackWarnings(check(targets, input, config, ctx), input.session_id);
}

function check(targets, input, config, ctx) {
  const styled = targets.filter((target) => !isExempt(target));
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

  if (violations.length === 0) return styleDecision(styled, input, config);

  ctx.key = key;
  const attempt = bumpAttempt(input.session_id, key);
  const message = `[concise] ${violations.join(" ")}`;
  // A deny stops here: the style state stays untouched so its own counter starts clean.
  if (attempt <= config.maxRetries) return deny(message);

  // Reset on the way out, so the next episode nudges again instead of being exempt.
  resetAttempt(input.session_id, key);
  const flagText = `${message}\n\n(Allowed through after ${config.maxRetries} nudges, flagging for manual review.)`;
  return mergeFlag(flagText, styleDecision(styled, input, config));
}

// A hook bug must never block real work: runHook turns a throw into an allow.
await runHook({ hook: "check-edit", event: "PreToolUse" }, decide);
