#!/usr/bin/env node
import { createHash } from "node:crypto";
import { loadConfig } from "./lib/config.mjs";
import { styleDecision, styleDecisionForText, prepareStyle, replyConfig, withPackWarnings } from "./lib/style-check.mjs";
import { runHook, bypassResult } from "./lib/hook-main.mjs";

// MCP fields people read once the tool posts them, picked by words in the server and tool name.
const ALWAYS = ["body", "comment", "review_body"];
const BY_NAME = [
  [/issue|pull|ticket|comment|review|task|project/i, ["description", "title"]],
  [/message|post|comment|reply|chat|send|mail/i, ["text", "message", "subject"]],
  [/doc|page|note|wiki|article|post/i, ["content", "markdown", "text", "title", "payload"]],
];
// Built-in tools whose text shows in the session, each behind its own `scan` switch.
// A plan is a document; its file sits under .claude/, which styleIgnoreGlobs skip.
const BUILT_IN = {
  ExitPlanMode: { scan: "plans", label: "plan", keys: ["plan"], scope: "files" },
  TaskCreate: { scan: "tasks", label: "task", keys: ["subject", "description", "activeForm"], scope: "reply" },
  TaskUpdate: { scan: "tasks", label: "task", keys: ["subject", "description", "activeForm"], scope: "reply" },
  AskUserQuestion: { scan: "questions", label: "question", keys: ["question", "label", "description"], scope: "reply" },
};
const PATH_KEYS = ["path", "file_path", "filePath"];
const MIN_LENGTH = 20;
const MAX_DEPTH = 4;

const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
const uniq = (list) => [...new Set(list)];

/** [key, text] pairs for the named string fields anywhere in the input, a few levels deep. */
function collect(value, keys, out = [], depth = 0) {
  if (depth > MAX_DEPTH || !value || typeof value !== "object") return out;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") collect(item, keys, out, depth + 1);
    else if (keys.includes(key) && item.trim()) out.push([key, item]);
  }
  return out;
}

/** Files an MCP tool writes: `{ path, content }`, `files: [{ path, content }]`, or `edits: [{ newText }]`. */
function fileTargets(input) {
  const out = [];
  for (const item of [input, ...(Array.isArray(input.files) ? input.files : [])]) {
    const path = PATH_KEYS.map((key) => item?.[key]).find((value) => typeof value === "string" && value);
    if (!path) continue;
    const edits = (Array.isArray(item.edits) ? item.edits : []).map((edit) => edit?.newText).filter((text) => typeof text === "string");
    if (typeof item.content === "string") out.push({ path, chunks: [item.content], wholeFile: true });
    else if (edits.length) out.push({ path, chunks: edits, wholeFile: false });
  }
  return out;
}

/** What to scan for one tool call, or null when the tool posts nothing people read. */
function planFor(toolName, input) {
  const builtIn = BUILT_IN[toolName];
  if (builtIn) return { ...builtIn, files: [], texts: collect(input, builtIn.keys) };
  if (typeof toolName !== "string" || !toolName.startsWith("mcp__") || /concise/i.test(toolName)) return null;
  const name = toolName.slice("mcp__".length).split("__").join(" ");
  const files = fileTargets(input);
  // A tool that writes files carries a commit message at most, never a post.
  if (files.length) return { scan: "mcp", label: `${name} commit message`, files, texts: collect({ message: input.message }, ["message"]), scope: "commit" };
  const keys = uniq([...ALWAYS, ...BY_NAME.filter(([re]) => re.test(name)).flatMap(([, list]) => list)]);
  const texts = collect(input, keys);
  return { scan: "mcp", label: `${name} ${uniq(texts.map(([key]) => key)).join(" and ")}`, files, texts, scope: "gh" };
}

// Keyed on the call minus its text, so revisions of one post share a retry counter.
function keyOf(toolName, input, texts) {
  const scanned = new Set(texts.map(([, text]) => text));
  const scaffold = JSON.stringify(input, (key, value) => (typeof value === "string" && scanned.has(value) ? undefined : value));
  return `style:tool:${shortHash(`${toolName}\0${scaffold}`)}`;
}

function combine(...results) {
  return results.find((r) => r.hookSpecificOutput?.permissionDecision) || results.find((r) => Object.keys(r).length > 0) || {};
}

async function decide(input, ctx) {
  const toolInput = input.tool_input || {};
  const plan = planFor(input.tool_name, toolInput);
  if (!plan) return {};
  const text = plan.texts.map(([, value]) => value).join("\n\n");
  const files = plan.files.filter((file) => !file.chunks.some((chunk) => chunk.includes("concise-ignore-file")));
  const textOn = text.trim().length >= MIN_LENGTH && !text.includes("concise-ignore");
  if (!textOn && files.length === 0) return {};

  const config = loadConfig(input.cwd);
  ctx.config = config;
  if (config.scan[plan.scan] === false) return {};
  const bypassed = bypassResult([text, ...files.flatMap((file) => file.chunks)], config, ctx);
  if (bypassed) return bypassed;
  await prepareStyle(input.cwd, config);
  const fileResult = files.length ? styleDecision(files, input, config) : {};
  const textConfig = plan.scope === "reply" ? replyConfig(config) : config;
  const textResult = textOn
    ? styleDecisionForText(text, keyOf(input.tool_name, toolInput, plan.texts), plan.label, input, textConfig, "PreToolUse", plan.scope, null)
    : {};
  return withPackWarnings(combine(fileResult, textResult), input.session_id);
}

await runHook({ hook: "check-tool-text", event: "PreToolUse" }, decide);
