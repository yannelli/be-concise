import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bypassMatch } from "../../hooks/lib/hook-main.mjs";
import { extractPatch, parseApplyPatch } from "../../hooks/lib/apply-patch.mjs";
import { extractBody } from "../../hooks/lib/pr-body.mjs";
import { gitCommitMessages, isProsePath } from "../../hooks/lib/prose.mjs";
import { prepareStyle, styleFindings } from "../../hooks/lib/style-check.mjs";

function targets(input) {
  const tool = input.tool_input || {};
  if (["Write", "Edit", "MultiEdit"].includes(input.tool_name)) {
    if (!tool.file_path) return [];
    const chunks = input.tool_name === "Write" ? [tool.content || ""]
      : input.tool_name === "Edit" ? [tool.new_string || ""]
        : (tool.edits || []).map((edit) => edit.new_string || "");
    return [{ path: tool.file_path, chunks, wholeFile: input.tool_name === "Write" }];
  }
  const patch = input.tool_name === "apply_patch" ? tool.command || tool.input
    : input.tool_name === "Bash" ? extractPatch(tool.command) : null;
  return patch ? parseApplyPatch(patch).map((file) => ({
    path: resolve(input.cwd, file.path), chunks: file.chunks, wholeFile: file.kind === "add",
  })) : [];
}

function exempt(target) {
  if (target.chunks.some((chunk) => chunk.includes("concise-ignore-file"))) return true;
  if (target.wholeFile) return false;
  try {
    return readFileSync(target.path, "utf8").includes("concise-ignore-file");
  } catch {
    return false;
  }
}

function replyText(input) {
  const lines = readFileSync(input.transcript_path, "utf8").trim().split("\n");
  for (const line of lines.reverse()) {
    try {
      const entry = JSON.parse(line);
      const message = entry.message || entry.payload || entry;
      if ((message.role || entry.role) !== "assistant") continue;
      const block = (message.content || []).find((part) => ["text", "output_text"].includes(part.type));
      if (typeof block?.text === "string") return block.text;
    } catch { /* Skip malformed transcript records. */ }
  }
  return "";
}

export async function scan(input, config, hook) {
  const out = [];
  const add = (text, path, scope, rules = config, chunk = 0) => {
    const result = styleFindings(text, path, rules, scope);
    out.push(...result.emDash.map((hit) => ({
      ...hit, category: "emDash", match: hit.char, fix: "Use a comma, period, colon, parentheses, or two sentences.",
      path, scope, chunk, hook,
    })), ...result.aiWriting.map((hit) => ({ ...hit, path, scope, chunk, hook })));
  };
  if (hook === "check-edit") {
    const list = targets(input);
    if (bypassMatch(list.flatMap((target) => target.chunks), config)) return out;
    await prepareStyle(input.cwd, config);
    for (const target of list.filter((item) => !exempt(item))) {
      target.chunks.forEach((text, index) => add(text, target.path, isProsePath(target.path) ? "files" : "comments", config, index));
    }
  } else if (hook === "check-bash") {
    const command = input.tool_input?.command || "";
    if (bypassMatch(command, config) || command.includes("concise-ignore")) return out;
    const isGh = /\bgh\s+(pr|issue)\s+(create|comment|edit)\b/.test(command);
    const messages = isGh ? [] : gitCommitMessages(command);
    if (!isGh && !messages.length) return out;
    await prepareStyle(input.cwd, config);
    const rules = { ...config, ignoreGlobs: [], styleIgnoreGlobs: [] };
    const text = isGh ? extractBody(command) : messages.join("\n\n");
    if (text) add(text, "reply.md", isGh ? "gh" : "commit", rules);
    add(command, "reply.md", "command", rules);
  } else if (hook === "check-reply" && config.stopHook && input.transcript_path) {
    const text = replyText(input);
    if (bypassMatch(text, config)) return out;
    const rules = { ...config, ignoreGlobs: [], styleIgnoreGlobs: [], features: { ...config.features } };
    for (const name of ["emDash", "aiWriting"]) {
      const feature = config.features[name];
      rules.features[name] = { ...feature, enabled: Boolean(feature.enabled && feature.replies) };
    }
    await prepareStyle(input.cwd, rules);
    add(text, "reply.md", "reply", rules);
  }
  return out;
}
