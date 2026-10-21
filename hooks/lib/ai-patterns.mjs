import { lineIndexer } from "./prose.mjs";
import { paragraphs, makeStats } from "./text-stats.mjs";
import { resolveActive } from "./packs.mjs";

const BOLD_SPAN = /\*\*(?=\S)[^\n]*?\*\*/g;
const BOLD_LIMIT = 3;
const BOLD_FIX = "restructure so the sentence leads with the point";
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+/;

/** Wraps resolveActive for the aiWriting config block. `loaded` comes from loadPacks. */
export function resolveCategories(ai = {}, loaded = {}) {
  const active = resolveActive({
    packs: loaded.packs || [],
    presets: loaded.presets || {},
    config: { features: { aiWriting: ai } },
  });
  return { ids: active.categoryIds, allow: active.allow, packs: active.packs };
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

function detected(text, pack, ctx, problems) {
  let found = [];
  try {
    found = pack.detect(text, ctx) || [];
  } catch (err) {
    problems.push({ path: pack.path, reason: `detect failed: ${err.message}` });
    return [];
  }
  return found
    .filter((f) => f && Number.isInteger(f.index) && f.match)
    .map((f, i) => ({
      pack,
      key: `${pack.id}:detect:${i}`,
      tier: f.tier === 2 ? 2 : 1,
      hit: String(f.match),
      index: f.index,
      fix: f.fix || "rewrite",
    }));
}

function collect(text, packs, ctx, problems) {
  const records = [];
  for (const pack of packs) {
    pack.patterns.forEach((pattern, i) => {
      for (const hit of matchesOf(text, pattern)) {
        records.push({ pack, key: `${pack.id}:${i}`, tier: pattern.tier, ...hit });
      }
    });
    if (pack.detect) records.push(...detected(text, pack, { ...ctx, options: pack.options }, problems));
    if (pack.categoryId === "formatting") {
      for (const hit of boldOveruse(text)) records.push({ pack, key: `${pack.id}:bold`, tier: 1, ...hit });
    }
  }
  return records;
}

export function scanAiWriting(text, { packs = [], categories, allow, ctx = {}, problems = [] } = {}) {
  if (typeof text !== "string" || text === "") return [];
  const ids = categories == null ? null : categories instanceof Set ? categories : new Set(categories);
  const active = ids ? packs.filter((p) => ids.has(p.categoryId)) : packs;
  if (active.length === 0) return [];

  const skip = (Array.isArray(allow) ? allow : []).map((a) => String(a).toLowerCase()).filter(Boolean);
  const records = collect(text, active, { path: null, scope: null, ...ctx, stats: makeStats(text) }, problems);
  const cluster = clusteredTier2(text, records);
  const lineAt = lineIndexer(text);
  const seen = new Set();

  return records
    .filter((r) => r.tier !== 2 || cluster.has(r))
    .filter((r) => !skip.some((s) => r.hit.toLowerCase().includes(s)))
    .sort((a, b) => a.index - b.index)
    .filter((r) => {
      const id = `${r.pack.categoryId}:${r.index}:${r.hit}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((r) => ({
      category: r.pack.categoryId,
      label: r.pack.category.label,
      match: r.hit,
      line: lineAt(r.index).line,
      fix: r.fix,
    }));
}
