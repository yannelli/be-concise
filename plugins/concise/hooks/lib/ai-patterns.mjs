import { CATEGORIES, PRESETS } from "./ai-patterns-data.mjs";
import { lineIndexer } from "./prose.mjs";

export { CATEGORIES, PRESETS };

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
const BOLD_SPAN = /\*\*(?=\S)[^\n]*?\*\*/g;
const BOLD_LIMIT = 3;
const BOLD_FIX = "restructure so the sentence leads with the point";
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+/;

export function resolveCategories({ preset, categories, allow } = {}) {
  const base = PRESETS[preset] || PRESETS.default;
  const wanted = Array.isArray(categories) ? categories : base.categories;
  return {
    ids: new Set(wanted.filter((id) => BY_ID.has(id))),
    allow: [...base.allow, ...(Array.isArray(allow) ? allow : [])],
  };
}

function paragraphs(text) {
  const ranges = [];
  const gap = /\n[ \t]*\n/g;
  let start = 0;
  let m;
  while ((m = gap.exec(text))) {
    ranges.push({ start, end: m.index, text: text.slice(start, m.index) });
    start = gap.lastIndex;
  }
  ranges.push({ start, end: text.length, text: text.slice(start) });
  return ranges;
}

function matchesOf(text, pattern) {
  const found = [];
  pattern.re.lastIndex = 0;
  let m;
  while ((m = pattern.re.exec(text)) !== null) {
    if (m[0] === "") {
      pattern.re.lastIndex += 1;
      continue;
    }
    const hit = m.groups?.hit ?? m[0];
    found.push({ hit, index: m.index + m[0].lastIndexOf(hit), fix: pattern.fix });
  }
  return found;
}

// Each list item line is its own unit for the bold count; a wrapped line joins the item above.
function boldUnits(para) {
  const units = [];
  let offset = 0;
  for (const line of para.text.split("\n")) {
    if (units.length === 0 || LIST_ITEM.test(line)) units.push({ start: para.start + offset, text: line });
    else units[units.length - 1].text += `\n${line}`;
    offset += line.length + 1;
  }
  return units;
}

function boldOveruse(text) {
  const found = [];
  for (const unit of paragraphs(text).flatMap(boldUnits)) {
    const spans = [...unit.text.matchAll(BOLD_SPAN)];
    if (spans.length < BOLD_LIMIT) continue;
    found.push({ hit: spans[0][0], index: unit.start + spans[0].index, fix: BOLD_FIX });
  }
  return found;
}

function clusteredTier2(text, records) {
  const tier2 = records.filter((r) => r.tier === 2);
  if (tier2.length < 2) return new Set();
  const ranges = paragraphs(text);
  const groups = new Map();
  for (const r of tier2) {
    const at = ranges.findIndex((range) => r.index >= range.start && r.index <= range.end);
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push(r);
  }
  const keep = new Set();
  for (const group of groups.values()) {
    if (new Set(group.map((r) => r.key)).size < 2) continue;
    for (const r of group) keep.add(r);
  }
  return keep;
}

function collect(text, ids) {
  const records = [];
  for (const cat of CATEGORIES) {
    if (!ids.has(cat.id)) continue;
    cat.patterns.forEach((pattern, i) => {
      for (const hit of matchesOf(text, pattern)) {
        records.push({ cat, key: `${cat.id}:${i}`, tier: pattern.tier, ...hit });
      }
    });
    if (cat.id === "formatting") {
      for (const hit of boldOveruse(text)) records.push({ cat, key: "formatting:bold", tier: 1, ...hit });
    }
  }
  return records;
}

export function scanAiWriting(text, { categories, allow } = {}) {
  if (typeof text !== "string" || text === "") return [];
  const ids = categories instanceof Set ? categories : new Set(categories || BY_ID.keys());
  const skip = (Array.isArray(allow) ? allow : []).map((a) => String(a).toLowerCase()).filter(Boolean);
  const records = collect(text, ids);
  const cluster = clusteredTier2(text, records);
  const lineAt = lineIndexer(text);
  const seen = new Set();

  return records
    .filter((r) => r.tier !== 2 || cluster.has(r))
    .filter((r) => !skip.some((s) => r.hit.toLowerCase().includes(s)))
    .sort((a, b) => a.index - b.index)
    .filter((r) => {
      const id = `${r.cat.id}:${r.index}:${r.hit}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((r) => ({
      category: r.cat.id,
      label: r.cat.label,
      match: r.hit,
      line: lineAt(r.index).line,
      fix: r.fix,
    }));
}
