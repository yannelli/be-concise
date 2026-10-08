import { isIgnored } from "./config.mjs";
import { proseSpans, isProsePath } from "./prose.mjs";
import { findDashes } from "./em-dash.mjs";
import { resolveCategories, scanAiWriting } from "./ai-patterns.mjs";
import { resolveStyle, clearStyle, sha256 } from "./confirm.mjs";
import { loadPacks, inScope } from "./packs.mjs";
import { dictionaryActive, dictionaryEntries, scanDictionary } from "./dictionary.mjs";
import { once } from "./state.mjs";
import { PLAIN, EDIT, parts, firedAny, trailer, styleSummary, referenceFor } from "./style-message.mjs";

export { REFERENCE_DIR, styleMessage, styleSummary } from "./style-message.mjs";

const TEXT_PATH = "reply.md";
const MODE_ORDER = ["deny", "ask", "confirm"];
const firstLineOf = (text) => text.split("\n")[0].trim().slice(0, 60);

let loaded = { packs: [], categories: [], presets: {}, problems: [] };
let runtime = [];
let record = emptyRecord();

function emptyRecord() {
  return { findings: [], counts: { emDash: 0, aiWriting: 0, dictionary: 0 }, key: null, scope: null, lastScope: null };
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

function collect({ emDash, aiWriting, dictionary }, scope) {
  record.counts.emDash += emDash.length;
  record.counts.aiWriting += aiWriting.length;
  record.counts.dictionary += dictionary.length;
  record.lastScope = record.lastScope || scope;
  for (const hit of emDash) record.findings.push({ category: "emDash", match: hit.snippet, line: hit.line });
  for (const hit of aiWriting) record.findings.push({ category: hit.category, match: hit.match, line: hit.line });
  for (const hit of dictionary) record.findings.push({ category: `dictionary:${hit.id}`, match: hit.match, line: hit.line });
}

function compiledDictionary(config) {
  const { entries, problems } = dictionaryEntries(config);
  for (const problem of problems) {
    noteProblem(`dictionary:${problem.id}`, `[concise] dictionary entry "${problem.id}" ignored: ${problem.reason}`);
  }
  return entries;
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

/** `hook` is edit, bash, stop, or subagentStop; dictionary entries can be limited to some of them. */
export function styleFindings(text, path, config, scope = "files", hook = null) {
  const found = { emDash: [], aiWriting: [], dictionary: [] };
  const { emDash, aiWriting, dictionary } = found;
  const dash = (config.features || {}).emDash || {};
  const ai = (config.features || {}).aiWriting || {};
  const dictOn = dictionaryActive(config);
  if (!dash.enabled && !ai.enabled && !dictOn) return found;
  if (isIgnored(path, config.ignoreGlobs || [])) return found;
  if (isIgnored(path, config.styleIgnoreGlobs || [])) return found;

  const dashOn = dash.enabled && loaded.packs.some((p) => p.feature === "emDash" && inScope(p, scope));
  const resolved = ai.enabled ? resolveCategories(ai, loaded) : null;
  const packs = resolved ? resolved.packs.filter((p) => inScope(p, scope)) : [];
  const entries = dictOn ? compiledDictionary(config) : [];
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
    for (const hit of scanDictionary(span.text, entries, { hook, scope })) {
      if (keep(at(hit.line), hit.match)) dictionary.push({ ...hit, line: at(hit.line) });
    }
    if (packs.length === 0) continue;
    const hits = scanAiWriting(span.text, { packs, allow: resolved.allow, ctx: { path, scope, raw: span.raw }, problems: runtime });
    for (const hit of hits) {
      if (keep(at(hit.line), hit.match)) aiWriting.push({ ...hit, line: at(hit.line) });
    }
  }
  collect(found, scope);
  return found;
}

function strictestMode(fired, config) {
  const modes = [];
  if (fired.emDash) modes.push(config.features.emDash.mode);
  if (fired.aiWriting) modes.push(config.features.aiWriting.mode);
  if (fired.dictionary) modes.push(config.features.dictionary.mode);
  return MODE_ORDER.find((mode) => modes.includes(mode)) || "confirm";
}

function decide({ input, config, key, hash, fired, texts, summaries, event, scope }) {
  return resolveStyle({
    input,
    sessionId: input.session_id,
    key,
    hash,
    mode: strictestMode(fired, config),
    maxRetries: config.maxRetries,
    message: [...texts, trailer(fired, scope)].filter(Boolean).join("\n"),
    summary: summaries.join("; "),
    event,
    reference: referenceFor(fired),
  });
}

export function styleDecision(targets, input, config) {
  const texts = [];
  const summaries = [];
  const fired = { emDash: false, aiWriting: false, dictionary: false };
  const clean = [];
  let key = null;

  for (const target of targets) {
    const scope = isProsePath(target.path) ? "files" : "comments";
    const label = target.wholeFile ? target.path : null;
    const lines = target.wholeFile ? PLAIN : EDIT;
    let hit = false;
    for (const chunk of target.chunks) {
      const findings = styleFindings(chunk, target.path, config, scope, "edit");
      const where = label || `${target.path}, starting "${firstLineOf(chunk)}"`;
      const chunkTexts = parts(findings, where, lines);
      if (chunkTexts.length === 0) continue;
      hit = true;
      for (const [name, on] of Object.entries(firedAny(findings))) fired[name] = fired[name] || on;
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

export function styleDecisionForText(text, key, label, input, config, event = "PreToolUse", scope = "reply", hook = null) {
  const findings = styleFindings(text, TEXT_PATH, { ...config, ignoreGlobs: [], styleIgnoreGlobs: [] }, scope, hook);
  const texts = parts(findings, label, PLAIN);
  if (texts.length === 0) {
    clearStyle(input.session_id, key);
    return {};
  }
  record.key = record.key || key;
  record.scope = record.scope || scope;
  const fired = firedAny(findings);
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
