import { loadConfig } from "../hooks/lib/config.mjs";
import { prepareStyle, styleFindings, styleMessage } from "../hooks/lib/style-check.mjs";
import { bypassMatch } from "../hooks/lib/hook-main.mjs";
import { isVerbose } from "../hooks/lib/pr-body.mjs";
import { scanComments } from "../hooks/lib/comment-scan.mjs";
import { SCOPES } from "../hooks/lib/packs.mjs";
import { HOOKS } from "../hooks/lib/dictionary.mjs";
import { problem } from "../web/configuration.mjs";

const HOOK_FOR = { files: "edit", comments: "edit", code: "edit", gh: "bash", commit: "bash", command: "bash", reply: "stop" };
const PATH_FOR = { files: "check.md", comments: "check.js", code: "check.js" };
const FILE_SCOPES = ["files", "comments", "code"];
const DASH_FIX = "a comma, period, colon, parentheses, or two sentences";

function rulesFor(config, scope, hook, path) {
  const rules = path && FILE_SCOPES.includes(scope) ? { ...config } : { ...config, ignoreGlobs: [], styleIgnoreGlobs: [] };
  if (scope !== "reply" && !["stop", "subagentStop"].includes(hook)) return rules;
  const { emDash, aiWriting } = config.features;
  return {
    ...rules,
    features: {
      ...config.features,
      emDash: { ...emDash, enabled: Boolean(emDash.enabled && emDash.replies) },
      aiWriting: { ...aiWriting, enabled: Boolean(aiWriting.enabled && aiWriting.replies) },
    },
  };
}

function coreFindings(text, path, scope, config) {
  const out = [];
  const checks = config.checks || {};
  if (scope === "gh" && checks.prBody !== false) {
    const verdict = isVerbose(text, { maxParagraphs: config.maxPrBodyParagraphs, maxSentences: config.maxPrBodySentences });
    if (verdict.verbose) out.push({ check: "prBody", reason: verdict.reason });
  }
  if (["comments", "code"].includes(scope) && checks.comments !== false) {
    for (const run of scanComments(text, path)) {
      if (run.length > config.maxCommentLines && !run.text.includes("concise-ignore")) {
        out.push({ check: "comments", line: run.startLine, reason: `comment run of ${run.length} lines (limit ${config.maxCommentLines})` });
      }
    }
  }
  if (FILE_SCOPES.includes(scope) && checks.fileSize !== false) {
    const lines = text.split("\n").length;
    if (lines > config.maxFileLines) out.push({ check: "fileSize", reason: `${lines} lines as a new file (limit ${config.maxFileLines})` });
  }
  return out;
}

/** Runs the style checks, and the core checks that apply to the scope, over text without touching hook state. */
export async function checkText({ text, scope = "reply", hook, path, cwd = process.cwd(), env = process.env, config }) {
  if (typeof text !== "string") throw problem("text must be a string");
  if (!SCOPES.includes(scope)) throw problem(`scope must be one of ${SCOPES.join(", ")}`);
  const hookId = hook || HOOK_FOR[scope];
  if (!HOOKS.includes(hookId)) throw problem(`hook must be one of ${HOOKS.join(", ")}`);
  const effective = config || loadConfig(cwd, env);
  const bypass = bypassMatch(text, effective);
  if (bypass) return { scope, hook: hookId, clean: true, bypass, findings: [], core: [], message: null };
  const target = path || PATH_FOR[scope] || "reply.md";
  const rules = rulesFor(effective, scope, hookId, path);
  await prepareStyle(cwd, rules);
  // A code file is checked as an edit is: comment runs, then the whole text for `code` packs.
  const found = styleFindings(text, target, rules, scope === "code" ? "comments" : scope, hookId);
  const findings = [
    ...found.emDash.map((hit) => ({ category: "emDash", match: hit.char, line: hit.line, fix: DASH_FIX })),
    ...found.aiWriting.map(({ category, match, line, fix }) => ({ category, match, line, fix })),
    ...found.dictionary.map(({ id, match, line, fix }) => ({ category: `dictionary:${id}`, match, line, fix })),
  ].sort((a, b) => a.line - b.line);
  const core = coreFindings(text, target, scope, effective);
  return {
    scope,
    hook: hookId,
    path: target,
    clean: findings.length === 0 && core.length === 0,
    findings,
    core,
    message: styleMessage(found, null),
    problems: effective.problems,
  };
}
