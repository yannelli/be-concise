import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REFERENCE_DIR = resolve(PLUGIN_ROOT, "skills", "concise-rules", "references");
const DASH_REFERENCE = resolve(REFERENCE_DIR, "avoid-ai-speak.md");
const AI_REFERENCE = resolve(REFERENCE_DIR, "ai-speak-patterns.md");

const DASH_NAMES = { "—": "em dash", "–": "en dash", "--": "double hyphen" };
const SHORT_NAMES = { "—": "em", "–": "en", "--": "double hyphen" };
const LINE_LIMIT = 10;
const MATCH_LIMIT = 4;
const DASH_FIX = "Fix: a comma, period, colon, parentheses, or two sentences.";
const SUPPRESS_HINT = "Suppress: concise-ignore on the line, or allowList.phrases in concise.json.";

export const PLAIN = { one: (n) => `line ${n}`, many: (list) => `lines ${list}` };
export const EDIT = { one: (n) => `line ${n} of the edit`, many: (list) => `lines ${list} of the edit` };
const oneLine = (text) => text.replace(/\s+/g, " ").trim();
const plural = (name, n) => (n === 1 ? name : `${name}${name.endsWith("dash") ? "es" : "s"}`);

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

export function parts(findings, label, where) {
  const summary = styleSummary(findings, label);
  if (!summary) return [];
  const dash = findings.emDash.length ? [dashGroup(findings.emDash, where)] : [];
  const dictionary = (findings.dictionary || []).map((hit) => ({ ...hit, category: `dictionary:${hit.id}` }));
  return [`[concise] ${summary}.`, ...dash, ...aiGroups(findings.aiWriting, where), ...aiGroups(dictionary, where)];
}

export const firedAny = (findings) => ({
  emDash: findings.emDash.length > 0,
  aiWriting: findings.aiWriting.length > 0,
  dictionary: (findings.dictionary || []).length > 0,
});

export function trailer(fired, scope) {
  const references = [fired.emDash ? DASH_REFERENCE : null, fired.aiWriting ? AI_REFERENCE : null].filter(Boolean);
  const suppress = scope === "reply" ? "" : SUPPRESS_HINT;
  const reference = references.length ? `Reference: ${references.join(", ")}` : "";
  return [suppress, reference].filter(Boolean).join(" ");
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
  const words = (findings.dictionary || []).length;
  if (words) out.push(`${words} dictionary ${words === 1 ? "match" : "matches"}`);
  if (out.length === 0) return null;
  return label ? `${out.join(", ")} in ${label}` : out.join(", ");
}

export const referenceFor = (fired) => (fired.emDash ? DASH_REFERENCE : fired.aiWriting ? AI_REFERENCE : null);
