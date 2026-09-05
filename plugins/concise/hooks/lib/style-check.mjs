import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { isIgnored } from "./config.mjs";
import { proseSpans, isProsePath } from "./prose.mjs";
import { findDashes } from "./em-dash.mjs";
import { resolveCategories, scanAiWriting } from "./ai-patterns.mjs";
import { resolveStyle, clearStyle, sha256 } from "./confirm.mjs";
import { loadPacks, inScope } from "./packs.mjs";
import { once } from "./state.mjs";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REFERENCE_DIR = resolve(PLUGIN_ROOT, "skills", "concise-rules", "references");
const DASH_REFERENCE = resolve(REFERENCE_DIR, "avoid-ai-speak.md");
const AI_REFERENCE = resolve(REFERENCE_DIR, "ai-speak-patterns.md");

const DASH_NAMES = { "—": "em dash", "–": "en dash", "--": "double hyphen" };
const SHORT_NAMES = { "—": "em", "–": "en", "--": "double hyphen" };
const LINE_LIMIT = 10;
const MATCH_LIMIT = 4;
const TEXT_PATH = "reply.md";
const MODE_ORDER = ["deny", "ask", "confirm"];
const DASH_FIX = "Fix: a comma, period, colon, parentheses, or two sentences.";
const SUPPRESS_HINT = "Suppress: concise-ignore on the line, or allowList.phrases in concise.json.";

const PLAIN = { one: (n) => `line ${n}`, many: (list) => `lines ${list}` };
const EDIT = { one: (n) => `line ${n} of the edit`, many: (list) => `lines ${list} of the edit` };
const firstLineOf = (text) => text.split("\n")[0].trim().slice(0, 60);
const oneLine = (text) => text.replace(/\s+/g, " ").trim();
const plural = (name, n) => (n === 1 ? name : `${name}${name.endsWith("dash") ? "es" : "s"}`);

let loaded = { packs: [], categories: [], presets: {}, problems: [] };
let runtime = [];
let record = emptyRecord();

function emptyRecord() {
  return { findings: [], counts: { emDash: 0, aiWriting: 0 }, key: null, scope: null, lastScope: null };
}

/** Loads the pattern packs for this cwd. Every hook awaits it before it calls styleFindings. */
export async function prepareStyle(cwd, config) {
  loaded = await loadPacks({ cwd, config, env: process.env });
  runtime = [];
  record = emptyRecord();
  return loaded;
}

/** Side channel for the log entry: what this hook run scanned and decided on. */
export function styleLog() {
  return record;
}

function noteProblem(path, message) {
  if (runtime.some((problem) => problem.path === path)) return;
  runtime.push({ path, message, reason: message });
}

/** Compiles a config regex list, drops what does not compile, and reports it once. */
export function compileRegexList(sources, kind) {
  const out = [];
  for (const source of sources || []) {
    try {
      out.push(new RegExp(String(source), "i"));
    } catch (err) {
      noteProblem(`${kind}:${source}`, `[concise] ${kind} pattern "${source}" ignored: ${err.message}`);
    }
  }
  return out;
}

function allowTester(config) {
  const list = config.allowList || {};
  const phrases = (list.phrases || []).map((phrase) => String(phrase).toLowerCase()).filter(Boolean);
  const patterns = compileRegexList(list.patterns, "allow list");
  if (phrases.length === 0 && patterns.length === 0) return null;
  return (match, line) => {
    const texts = [String(match ?? ""), String(line ?? "")];
    const lower = texts.map((text) => text.toLowerCase());
    return phrases.some((phrase) => lower.some((text) => text.includes(phrase))) ||
      patterns.some((re) => texts.some((text) => re.test(text)));
  };
}

function collect(emDash, aiWriting, scope) {
  record.counts.emDash += emDash.length;
  record.counts.aiWriting += aiWriting.length;
  record.lastScope = record.lastScope || scope;
  for (const hit of emDash) record.findings.push({ category: "emDash", match: hit.snippet, line: hit.line });
  for (const hit of aiWriting) record.findings.push({ category: hit.category, match: hit.match, line: hit.line });
}

/** One line per skipped pack or bad config regex, at most once per session. */
export function packWarnings(sessionId) {
  const out = [];
  for (const problem of [...loaded.problems, ...runtime]) {
    if (!once(sessionId, `warned:${problem.path}`)) continue;
    out.push(problem.message || `[concise] pack ${problem.path} skipped: ${problem.reason}`);
  }
  return out;
}

export function withPackWarnings(result, sessionId) {
  const warnings = packWarnings(sessionId);
  if (warnings.length === 0) return result;
  const text = warnings.join(" ");
  return { ...result, systemMessage: result.systemMessage ? `${result.systemMessage} ${text}` : text };
}

export function styleFindings(text, path, config, scope = "files") {
  const emDash = [];
  const aiWriting = [];
  const dash = (config.features || {}).emDash || {};
  const ai = (config.features || {}).aiWriting || {};
  if (!dash.enabled && !ai.enabled) return { emDash, aiWriting };
  if (isIgnored(path, config.ignoreGlobs || [])) return { emDash, aiWriting };
  if (isIgnored(path, config.styleIgnoreGlobs || [])) return { emDash, aiWriting };

  const dashOn = dash.enabled && loaded.packs.some((p) => p.feature === "emDash" && inScope(p, scope));
  const resolved = ai.enabled ? resolveCategories(ai, loaded) : null;
  const packs = resolved ? resolved.packs.filter((p) => inScope(p, scope)) : [];
  const lines = text.split("\n");
  const allowed = allowTester(config);
  const keep = (line, match) => {
    const source = lines[line - 1] || "";
    if (source.includes("concise-ignore")) return false;
    return !(allowed && allowed(match, source));
  };

  for (const span of proseSpans(text, path)) {
    const at = (line) => span.line + line - 1;
    if (dashOn) {
      for (const hit of findDashes(span.text, { enDash: dash.enDash, doubleHyphen: dash.doubleHyphen })) {
        if (keep(at(hit.line), hit.char)) emDash.push({ ...hit, line: at(hit.line) });
      }
    }
    if (packs.length === 0) continue;
    const found = scanAiWriting(span.text, { packs, allow: resolved.allow, ctx: { path, scope }, problems: runtime });
    for (const hit of found) {
      if (keep(at(hit.line), hit.match)) aiWriting.push({ ...hit, line: at(hit.line) });
    }
  }
  collect(emDash, aiWriting, scope);
  return { emDash, aiWriting };
}

function dashPhrase(hits) {
  const names = new Set(hits.map((hit) => DASH_NAMES[hit.char]));
  if (names.size === 1) return `${hits.length} ${plural([...names][0], hits.length)}`;
  const counts = Object.keys(SHORT_NAMES)
    .map((char) => ({ char, n: hits.filter((hit) => hit.char === char).length }))
    .filter((entry) => entry.n > 0)
    .map((entry) => `${entry.n} ${SHORT_NAMES[entry.char]}`);
  return `${hits.length} dashes (${counts.join(", ")})`;
}

function lineList(lines, where) {
  const unique = [...new Set(lines)].sort((a, b) => a - b);
  if (unique.length === 1) return `at ${where.one(unique[0])}`;
  const shown = unique.slice(0, LINE_LIMIT);
  const extra = unique.length - shown.length;
  return `on ${where.many(shown.join(", "))}${extra > 0 ? ` (+${extra} more)` : ""}`;
}

function dashGroup(hits, where) {
  const lines = hits.map((hit) => hit.line);
  return `[concise:emDash] ${dashPhrase(hits)} ${lineList(lines, where)}: "…${hits[0].snippet}…". ${DASH_FIX}`;
}

/** One line per category: the count, the lines, and each distinct match with its fix. */
function aiGroups(hits, where) {
  const groups = new Map();
  for (const hit of hits) {
    if (!groups.has(hit.category)) groups.set(hit.category, { lines: [], fixes: new Map() });
    const group = groups.get(hit.category);
    group.lines.push(hit.line);
    const match = oneLine(hit.match);
    if (!group.fixes.has(match)) group.fixes.set(match, hit.fix);
  }
  return [...groups].map(([category, group]) => {
    const shown = [...group.fixes].slice(0, MATCH_LIMIT).map(([match, fix]) => `"${match}" (${fix})`);
    const extra = group.fixes.size - shown.length;
    const count = group.lines.length;
    const noun = count === 1 ? "match" : "matches";
    return `[concise:${category}] ${count} ${noun} ${lineList(group.lines, where)}: ${shown.join("; ")}${extra > 0 ? `; +${extra} more` : ""}.`;
  });
}

function parts(findings, label, where) {
  const summary = styleSummary(findings, label);
  if (!summary) return [];
  const dash = findings.emDash.length ? [dashGroup(findings.emDash, where)] : [];
  return [`[concise] ${summary}.`, ...dash, ...aiGroups(findings.aiWriting, where)];
}

function trailer(fired, scope) {
  const references = [fired.emDash ? DASH_REFERENCE : null, fired.aiWriting ? AI_REFERENCE : null].filter(Boolean);
  const suppress = scope === "reply" ? "" : `${SUPPRESS_HINT} `;
  return `${suppress}Reference: ${references.join(", ")}`;
}

export function styleMessage(findings, label, where = PLAIN) {
  const out = parts(findings, label, where);
  return out.length ? out.join("\n") : null;
}

export function styleSummary(findings, label) {
  const out = [];
  if (findings.emDash.length) out.push(dashPhrase(findings.emDash));
  if (findings.aiWriting.length) {
    out.push(`${findings.aiWriting.length} ${plural("AI writing pattern", findings.aiWriting.length)}`);
  }
  if (out.length === 0) return null;
  return label ? `${out.join(", ")} in ${label}` : out.join(", ");
}

function strictestMode(fired, config) {
  const modes = [];
  if (fired.emDash) modes.push(config.features.emDash.mode);
  if (fired.aiWriting) modes.push(config.features.aiWriting.mode);
  return MODE_ORDER.find((mode) => modes.includes(mode)) || "confirm";
}

const referenceFor = (fired) => (fired.emDash ? DASH_REFERENCE : AI_REFERENCE);

function decide({ input, config, key, hash, fired, texts, summaries, event, scope }) {
  return resolveStyle({
    sessionId: input.session_id,
    key,
    hash,
    mode: strictestMode(fired, config),
    maxRetries: config.maxRetries,
    message: [...texts, trailer(fired, scope)].join("\n"),
    summary: summaries.join("; "),
    event,
    reference: referenceFor(fired),
  });
}

export function styleDecision(targets, input, config) {
  const texts = [];
  const summaries = [];
  const fired = { emDash: false, aiWriting: false };
  const clean = [];
  let key = null;

  for (const target of targets) {
    const scope = isProsePath(target.path) ? "files" : "comments";
    const label = target.wholeFile ? target.path : null;
    const lines = target.wholeFile ? PLAIN : EDIT;
    let hit = false;
    for (const chunk of target.chunks) {
      const findings = styleFindings(chunk, target.path, config, scope);
      const where = label || `${target.path}, starting "${firstLineOf(chunk)}"`;
      const chunkTexts = parts(findings, where, lines);
      if (chunkTexts.length === 0) continue;
      hit = true;
      fired.emDash = fired.emDash || findings.emDash.length > 0;
      fired.aiWriting = fired.aiWriting || findings.aiWriting.length > 0;
      texts.push(...chunkTexts);
      summaries.push(styleSummary(findings, where));
    }
    if (hit) {
      key = key || `style:${target.path}`;
      record.scope = record.scope || scope;
    } else clean.push(`style:${target.path}`);
  }

  if (!key) {
    for (const stale of clean) clearStyle(input.session_id, stale);
    return {};
  }

  record.key = key;
  const hash = sha256(targets.flatMap((target) => target.chunks).join("\0"));
  return decide({ input, config, key, hash, fired, texts, summaries, event: "PreToolUse", scope: "files" });
}

export function styleDecisionForText(text, key, label, input, config, event = "PreToolUse", scope = "reply") {
  const findings = styleFindings(text, TEXT_PATH, { ...config, ignoreGlobs: [], styleIgnoreGlobs: [] }, scope);
  const texts = parts(findings, label, PLAIN);
  if (texts.length === 0) {
    clearStyle(input.session_id, key);
    return {};
  }
  record.key = record.key || key;
  record.scope = record.scope || scope;
  const fired = { emDash: findings.emDash.length > 0, aiWriting: findings.aiWriting.length > 0 };
  return decide({
    input,
    config,
    key,
    hash: sha256(text),
    fired,
    texts,
    summaries: [styleSummary(findings, label)],
    event,
    scope,
  });
}
