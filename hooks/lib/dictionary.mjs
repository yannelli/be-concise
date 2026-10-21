import { SCOPES, DEFAULT_SCOPE, ID_RE } from "./packs.mjs";
import { lineIndexer } from "./prose.mjs";

export const MATCHES = ["exact", "contains", "startsWith", "endsWith", "regex"];
export const UNITS = ["word", "line", "text"];
export const HOOKS = ["edit", "bash", "stop", "subagentStop"];

const WORD = "[\\p{L}\\p{N}_]";
const BEFORE = `(?<!${WORD})`;
const AFTER = `(?!${WORD})`;
const MARKER = /^([ \t]*)(\/\/+|#+|\/\*+|\*(?!\/))/gm;
const CLOSER = /\*+\/([ \t]*)$/gm;

const object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blank = (text) => text.replace(/[^\n]/g, " ");

function listProblem(raw, field, allowed) {
  if (raw[field] === undefined) return null;
  if (!Array.isArray(raw[field]) || raw[field].length === 0) return `${field} must be a non-empty array`;
  const unknown = raw[field].find((item) => !allowed.includes(item));
  return unknown === undefined ? null : `unknown ${field.replace(/s$/, "")} ${JSON.stringify(unknown)}`;
}

/** The reason an entry is unusable, or null. An entry with `enabled: false` needs only its id. */
export function entryProblem(raw) {
  if (!object(raw)) return "entry is not an object";
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) return `bad id ${JSON.stringify(raw.id ?? null)}`;
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") return "enabled must be a boolean";
  if (raw.enabled === false) return null;
  if (!MATCHES.includes(raw.match)) return `match must be one of ${MATCHES.join(", ")}`;
  if (typeof raw.value !== "string" || raw.value === "") return "value must be a non-empty string";
  if (typeof raw.fix !== "string" || raw.fix === "") return "fix must be a non-empty string";
  if (raw.on !== undefined && !UNITS.includes(raw.on)) return `on must be one of ${UNITS.join(", ")}`;
  if (raw.caseSensitive !== undefined && typeof raw.caseSensitive !== "boolean") return "caseSensitive must be a boolean";
  if (raw.flags !== undefined && (raw.match !== "regex" || typeof raw.flags !== "string")) return "flags applies to a regex entry only";
  const listReason = listProblem(raw, "hooks", HOOKS) || listProblem(raw, "scopes", SCOPES);
  if (listReason) return listReason;
  try {
    compileEntry(raw);
  } catch (err) {
    return `value does not compile: ${err.message}`;
  }
  return null;
}

function literalSource(entry) {
  const unit = entry.on || "word";
  const gap = unit === "line" ? "[ \\t]+" : "\\s+";
  const value = escape(entry.value.trim()).replace(/\s+/g, gap);
  const hit = `(?<hit>${value})`;
  if (entry.match === "contains") return unit === "word" ? `(?<hit>${WORD}*${value}${WORD}*)` : hit;
  if (unit === "word") {
    if (entry.match === "exact") return `${BEFORE}${hit}${AFTER}`;
    if (entry.match === "startsWith") return `${BEFORE}(?<hit>${value}${WORD}*)`;
    return `${BEFORE}(?<hit>${WORD}*${value})${AFTER}`;
  }
  const [open, close] = unit === "line" ? ["^[ \\t]*", "[ \\t\\r]*$"] : ["^\\s*", "\\s*$"];
  if (entry.match === "exact") return `${open}${hit}${close}`;
  if (entry.match === "startsWith") return `${open}${hit}`;
  return `${hit}${close}`;
}

/** Turns a valid entry into { id, fix, re, hooks, scopes }. Throws when the pattern does not compile. */
export function compileEntry(entry) {
  const hooks = Array.isArray(entry.hooks) ? entry.hooks : HOOKS;
  const scopes = Array.isArray(entry.scopes) ? entry.scopes : DEFAULT_SCOPE;
  if (entry.match === "regex") {
    const given = typeof entry.flags === "string" ? entry.flags : entry.caseSensitive ? "" : "i";
    const flags = [...new Set(`${given.replace(/[gdy]/g, "")}gd`)].join("");
    const re = new RegExp(entry.value, flags);
    return { id: entry.id, fix: entry.fix, re, hooks, scopes };
  }
  const flags = `gdu${entry.caseSensitive ? "" : "i"}${entry.on === "line" ? "m" : ""}`;
  return { id: entry.id, fix: entry.fix, re: new RegExp(literalSource(entry), flags), hooks, scopes };
}

/** True when the feature is on and holds at least one entry that is not switched off. */
export function dictionaryActive(config) {
  const dictionary = (config?.features || {}).dictionary;
  if (!object(dictionary) || dictionary.enabled !== true || !Array.isArray(dictionary.entries)) return false;
  return dictionary.entries.some((entry) => object(entry) && entry.enabled !== false);
}

/** Compiles the usable entries and lists the rest as { id, reason }. */
export function dictionaryEntries(config) {
  const entries = [];
  const problems = [];
  if (!dictionaryActive(config)) return { entries, problems };
  config.features.dictionary.entries.forEach((raw, index) => {
    const reason = entryProblem(raw);
    const id = object(raw) && typeof raw.id === "string" ? raw.id : `#${index}`;
    if (reason) problems.push({ id, reason });
    else if (raw.enabled !== false) entries.push(compileEntry(raw));
  });
  return { entries, problems };
}

// Comment runs keep their markers; blanking them in place lets line anchors see the text.
function unmark(text) {
  return text.replace(MARKER, (_all, indent, marker) => indent + blank(marker)).replace(CLOSER, (all) => blank(all));
}

/** Matches in `text` as { id, match, line, fix }, for the entries that cover this hook and scope. */
export function scanDictionary(text, entries, { hook = null, scope = null } = {}) {
  if (typeof text !== "string" || text === "") return [];
  const active = entries.filter((entry) => (!hook || entry.hooks.includes(hook)) && (!scope || entry.scopes.includes(scope)));
  if (active.length === 0) return [];
  const source = scope === "comments" ? unmark(text) : text;
  const lineAt = lineIndexer(source);
  const found = [];
  for (const entry of active) {
    for (const m of source.matchAll(entry.re)) {
      const hit = m.groups?.hit ?? m[0];
      if (hit.trim() === "") continue;
      const index = m.indices?.groups?.hit?.[0] ?? m.index;
      found.push({ id: entry.id, match: hit.trim(), line: lineAt(index).line, fix: entry.fix, index });
    }
  }
  return found.sort((a, b) => a.index - b.index).map(({ index, ...hit }) => hit);
}

/** Layer merge: entries union by id, and the higher layer's entry replaces a lower one with the same id. */
export function mergeEntries(base, layer) {
  const out = Array.isArray(base) ? [...base] : [];
  if (!Array.isArray(layer)) return out;
  for (const entry of layer) {
    const at = object(entry) ? out.findIndex((prior) => object(prior) && prior.id === entry.id) : -1;
    if (at === -1) out.push(entry);
    else out[at] = entry;
  }
  return out;
}
