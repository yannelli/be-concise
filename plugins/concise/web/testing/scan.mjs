import { readFileSync } from "node:fs";
import { isIgnored } from "../../hooks/lib/config.mjs";
import { bypassMatch } from "../../hooks/lib/hook-main.mjs";
import { targetsOf, isExempt } from "../../hooks/lib/edit-targets.mjs";
import { GH_COMMAND, apiFields, extractBody, extractTitle } from "../../hooks/lib/pr-body.mjs";
import { gitCommitMessages, isProsePath } from "../../hooks/lib/prose.mjs";
import { prepareStyle, styleFindings } from "../../hooks/lib/style-check.mjs";

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

// The same sources check-reply reads: a handback message, then the event's reply, then the transcript.
function replySource(input) {
  if (input.tool_name === "SubagentHandback") return String(input.tool_input?.message ?? "");
  if (typeof input.last_assistant_message === "string") return input.last_assistant_message;
  return input.transcript_path ? replyText(input) : null;
}

const HOOK_IDS = { "check-edit": "edit", "check-bash": "bash" };

export async function scan(input, config, hook) {
  const out = [];
  const handback = input.tool_name === "SubagentHandback";
  const hookId = HOOK_IDS[hook] || (handback || input.hook_event_name === "SubagentStop" ? "subagentStop" : "stop");
  const add = (text, path, scope, rules = config, chunk = 0) => {
    const result = styleFindings(text, path, rules, scope, hookId);
    out.push(...result.emDash.map((hit) => ({
      ...hit, category: "emDash", match: hit.char, fix: "Use a comma, period, colon, parentheses, or two sentences.",
      path, scope, chunk, hook,
    })), ...result.aiWriting.map((hit) => ({ ...hit, path, scope, chunk, hook })),
    ...result.dictionary.map((hit) => ({ ...hit, category: `dictionary:${hit.id}`, path, scope, chunk, hook })));
  };
  if (hook === "check-edit") {
    const list = targetsOf(input).filter((target) => config.scan?.[target.scan] !== false && !(target.file && isIgnored(target.file, config.ignoreGlobs)));
    if (bypassMatch(list.flatMap((target) => target.chunks), config)) return out;
    await prepareStyle(input.cwd, config);
    for (const target of list.filter((item) => !isExempt(item))) {
      target.chunks.forEach((text, index) => add(text, target.path, isProsePath(target.path) ? "files" : "comments", config, index));
    }
  } else if (hook === "check-bash") {
    const command = input.tool_input?.command || "";
    if (bypassMatch(command, config) || command.includes("concise-ignore")) return out;
    const isGh = GH_COMMAND.test(command);
    const posts = (isGh ? [extractTitle(command), extractBody(command, input.cwd)] : apiFields(command, input.cwd)).filter(Boolean);
    const messages = isGh ? [] : gitCommitMessages(command, input.cwd);
    if (!posts.length && !messages.length) return out;
    await prepareStyle(input.cwd, config);
    const rules = { ...config, ignoreGlobs: [], styleIgnoreGlobs: [] };
    posts.forEach((text, index) => add(text, "reply.md", "gh", rules, index));
    if (messages.length) add(messages.join("\n\n"), "reply.md", "commit", rules);
    add(command, "reply.md", "command", rules);
  } else if (hook === "check-reply" && config.stopHook) {
    const text = replySource(input);
    if (text === null || bypassMatch(text, config)) return out;
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
