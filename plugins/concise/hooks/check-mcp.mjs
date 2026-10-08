#!/usr/bin/env node
import { createHash } from "node:crypto";
import { loadConfig } from "./lib/config.mjs";
import { styleDecisionForText, prepareStyle, withPackWarnings } from "./lib/style-check.mjs";
import { runHook, bypassResult } from "./lib/hook-main.mjs";

// Fields that hold text people read once the tool posts it: a PR or issue body, a comment, a chat message.
const ALWAYS = ["body", "comment", "review_body"];
const BY_TOOL = [
  [/issue|pull|ticket|comment|review/i, ["description"]],
  [/message|post|comment|reply|chat|send/i, ["text", "message"]],
];
const MIN_LENGTH = 20;

const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

/** The postable text fields of an MCP tool call, as [field, text] pairs. Concise's own tools are skipped. */
function postedTexts(toolName, toolInput) {
  if (typeof toolName !== "string" || !toolName.startsWith("mcp__") || /concise/i.test(toolName)) return [];
  const tool = toolName.split("__").pop();
  const keys = [...ALWAYS, ...BY_TOOL.filter(([re]) => re.test(tool)).flatMap(([, names]) => names)];
  return [...new Set(keys)]
    .map((key) => [key, toolInput?.[key]])
    .filter(([, value]) => typeof value === "string" && value.trim().length >= MIN_LENGTH);
}

async function decide(input, ctx) {
  const texts = postedTexts(input.tool_name, input.tool_input);
  if (texts.length === 0) return {};
  const text = texts.map(([, value]) => value).join("\n\n");
  if (text.includes("concise-ignore")) return {};

  const config = loadConfig(input.cwd);
  ctx.config = config;
  const bypassed = bypassResult(text, config, ctx);
  if (bypassed) return bypassed;
  await prepareStyle(input.cwd, config);
  const [, server, tool] = input.tool_name.split("__");
  const label = `${server} ${tool} ${texts.map(([key]) => key).join(" and ")}`;
  const key = `style:mcp:${shortHash(`${input.tool_name}\0${text}`)}`;
  return withPackWarnings(styleDecisionForText(text, key, label, input, config, "PreToolUse", "gh", null), input.session_id);
}

await runHook({ hook: "check-mcp", event: "PreToolUse" }, decide);
