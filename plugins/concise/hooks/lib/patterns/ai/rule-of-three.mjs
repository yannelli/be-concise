const WORD_TRIAD = /\b([A-Za-z][\w'-]{2,15}),\s*([A-Za-z][\w'-]{2,15}),?\s+and\s+([A-Za-z][\w'-]{2,15})\b/g;
const ORDINAL_TRIAD = /\bfirst\b[^\n]{0,60}\bsecond\b[^\n]{0,80}\b(?:third|finally|lastly)\b/gi;
const MARKER = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/;

// A triad inside a longer comma list is an enumeration of real items.
const IN_LIST = /,\s*(?:[\w'\u2019-]+\s+){0,2}$/;

function wordTriads(text) {
  const out = [];
  WORD_TRIAD.lastIndex = 0;
  let m;
  while ((m = WORD_TRIAD.exec(text)) !== null) {
    const items = [m[1], m[2], m[3]].map((w) => w.toLowerCase());
    const before = text.slice(0, m.index).split(/[.!?\n]/).pop();
    if (new Set(items).size === 3 && !IN_LIST.test(before)) out.push({ index: m.index, text: m[0] });
  }
  return out;
}

function ordinalTriads(text) {
  const out = [];
  ORDINAL_TRIAD.lastIndex = 0;
  let m;
  while ((m = ORDINAL_TRIAD.exec(text)) !== null) out.push({ index: m.index, text: m[0] });
  return out;
}

function bulletTriads(stats, maxWords, spread) {
  const out = [];
  for (const block of stats.listBlocks()) {
    if (block.items.length !== 3) continue;
    const counts = block.items.map((i) => (i.text.replace(MARKER, "").match(/\S+/g) || []).length);
    if (Math.max(...counts) > maxWords) continue;
    if (Math.max(...counts) - Math.min(...counts) > spread) continue;
    out.push({ index: block.start, text: block.items[0].text.trim() });
  }
  return out;
}

function perParagraph(stats, hits) {
  const counts = new Map();
  for (const hit of hits) {
    const at = stats.paragraphs().findIndex((p) => hit.index >= p.start && hit.index <= p.end);
    counts.set(at, (counts.get(at) || 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

export default {
  id: "rule-of-three",
  feature: "aiWriting",
  category: {
    id: "rule-of-three",
    label: "rule of three",
    description: "Triads of adjectives, nouns, or clauses used past the point of restraint.",
    tags: ["rhetorical"],
  },
  source: "Pangram signs-of-ai-writing triad counts and tropes.fyi directory",
  presets: ["ryan", "all"],
  scope: ["files", "comments", "gh", "reply"],
  notes: "One accurate triad passes. The pack counts triads across the whole text and reports once when the rate crosses the threshold.",
  options: { minWords: 100, minTriads: 3, minPerParagraph: 2, bulletMaxWords: 8, bulletSpread: 3 },
  detect(text, ctx) {
    const o = ctx.options;
    if (ctx.stats.words().length < o.minWords) return [];
    const hits = [...wordTriads(text), ...ordinalTriads(text), ...bulletTriads(ctx.stats, o.bulletMaxWords, o.bulletSpread)];
    if (hits.length === 0) return [];
    hits.sort((a, b) => a.index - b.index);
    if (hits.length < o.minTriads && perParagraph(ctx.stats, hits) < o.minPerParagraph) return [];
    const shown = `${hits.length} three-item constructions: ${hits[0].text.replace(/\s+/g, " ")}`;
    return [{ index: hits[0].index, match: shown.slice(0, 79), fix: "vary the count, or cut to two" }];
  },
};
