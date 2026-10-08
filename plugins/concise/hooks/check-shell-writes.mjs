#!/usr/bin/env node
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadConfig, isIgnored } from "./lib/config.mjs";
import { dictionaryActive } from "./lib/dictionary.mjs";
import { gitChanges, readChanged, addedChunks, realPath } from "./lib/changed-files.mjs";
import { isProsePath } from "./lib/prose.mjs";
import { extractPatch, parseApplyPatch } from "./lib/apply-patch.mjs";
import { heredocWrites, fileFlagPaths } from "./lib/shell-text.mjs";
import { once } from "./lib/state.mjs";
import { styleFindings, prepareStyle, withPackWarnings } from "./lib/style-check.mjs";
import { PLAIN, parts, firedAny, referenceFor } from "./lib/style-message.mjs";
import { runHook, bypassResult } from "./lib/hook-main.mjs";

const SHELL_TOOLS = ["Bash", "PowerShell"];
const MAX_FILES = 20;
// The hook starts a moment after the tool ends, and some filesystems keep mtime in whole
// seconds, so the window opens a little before the command started.
const SLACK_MS = 2000;

const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

function styleOn(config) {
  const features = config.features || {};
  return Boolean(features.emDash?.enabled || features.aiWriting?.enabled || dictionaryActive(config));
}

// check-edit read heredoc writes and patches before they ran; check-bash read body and message files.
function skippedPaths(command, cwd, config) {
  const paths = [...fileFlagPaths(command), ...parseApplyPatch(extractPatch(command)).map((file) => file.path)];
  if (config.scan?.heredocWrites !== false) paths.push(...heredocWrites(command).map((write) => write.path));
  return new Set(paths.map((path) => realPath(resolve(cwd, path))));
}

function changedTexts(command, cwd, config, since) {
  const skipped = skippedPaths(command, cwd, config);
  const globs = [...(config.ignoreGlobs || []), ...(config.styleIgnoreGlobs || [])];
  const files = [];
  for (const file of gitChanges(cwd)) {
    if (files.length >= MAX_FILES) break;
    if (skipped.has(file.path)) continue;
    const text = readChanged(file.path, since);
    if (text === null || text.includes("concise-ignore-file") || isIgnored(file.path, globs)) continue;
    files.push({ ...file, text });
  }
  return files;
}

function findingKey(path, group, hit, source) {
  const category = group === "dictionary" ? `dictionary:${hit.id}` : hit.category || group;
  return `shell-write:${shortHash([path, category, hit.match ?? hit.char, source].join("\0"))}`;
}

/** The file's findings that this session has not reported, numbered by their line in the file. */
function unreported(file, config, sessionId) {
  const scope = isProsePath(file.path) ? "files" : "comments";
  const out = { emDash: [], aiWriting: [], dictionary: [] };
  const fresh = new Set();
  for (const chunk of addedChunks(file, file.text)) {
    const lines = chunk.text.split("\n");
    const found = styleFindings(chunk.text, file.path, config, scope, "edit");
    for (const [group, hits] of Object.entries(found)) {
      for (const hit of hits) {
        const key = findingKey(file.path, group, hit, lines[hit.line - 1]);
        if (!fresh.has(key) && !once(sessionId, key)) continue;
        fresh.add(key);
        out[group].push({ ...hit, line: chunk.start + hit.line - 1 });
      }
    }
  }
  return out;
}

function report(files, config, input, ctx) {
  const texts = [];
  const fired = { emDash: false, aiWriting: false };
  for (const file of files) {
    const found = unreported(file, config, input.session_id);
    const lines = parts(found, file.path, PLAIN);
    if (lines.length === 0) continue;
    texts.push(...lines);
    for (const [name, on] of Object.entries(firedAny(found))) fired[name] ||= on;
    ctx.key ||= `shell-write:${file.path}`;
  }
  if (texts.length === 0) return {};
  // The command already ran: this result only adds the reason next to its output.
  ctx.decision = "flag";
  const reference = referenceFor(fired);
  const fix = `This text is already on disk. Fix it with Edit${reference ? ` (read ${reference})` : ""}, or add concise-ignore on the line to keep it.`;
  return { decision: "block", reason: [...texts, fix].join("\n") };
}

async function decide(input, ctx) {
  const command = input.tool_input?.command;
  if (!SHELL_TOOLS.includes(input.tool_name) || typeof command !== "string") return {};
  const since = Date.now() - (Number(input.duration_ms) || 0) - SLACK_MS;
  const config = loadConfig(input.cwd);
  ctx.config = config;
  if (config.scan?.shellWrites === false || !styleOn(config)) return {};
  const cwd = input.cwd || ".";
  const files = changedTexts(command, cwd, config, since);
  if (files.length === 0) return {};
  const bypassed = bypassResult(command, config, ctx, "PostToolUse");
  if (bypassed) return bypassed;
  await prepareStyle(cwd, config);
  return withPackWarnings(report(files, config, input, ctx), input.session_id);
}

await runHook({ hook: "check-shell-writes", event: "PostToolUse" }, decide);
