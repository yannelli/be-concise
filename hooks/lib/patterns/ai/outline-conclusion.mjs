const CLOSING = /^(?:conclusion|summary|wrap-?up|recap|final thoughts|closing thoughts|in closing)s?$/i;
const CUE = /(?:as we[’']ve seen|as discussed above|as outlined above|we[’']ve (?:covered|explored|walked through)|pulling (?:this|it all) together|bringing it all together|to recap)/i;
const LIST_LINE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/m;
const STOPWORDS = new Set(["a", "an", "the", "of", "and", "or", "to", "for", "in", "on", "with", "is", "are"]);

const keywords = (title) =>
  title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));

const holds = (body, word) => new RegExp(`\\b${word}s?\\b`, "i").test(body);

function candidate(text, stats, closing) {
  const paras = stats.paragraphs().filter((p) => p.text.trim() !== "");
  if (!closing) return paras[paras.length - 1] || null;
  for (const p of paras) {
    if (p.end <= closing.end) continue;
    const raw = p.start >= closing.end ? p.text : text.slice(closing.end, p.end);
    const trimmed = raw.replace(/^\s+/, "");
    if (trimmed) return { text: trimmed, start: p.end - trimmed.length };
  }
  return null;
}

// A restatement cue is either a set phrase or three clauses each naming a different section.
function restates(body, titles, minClauses) {
  if (CUE.test(body)) return true;
  const clauses = body.split(/[;,]/);
  const covered = new Set();
  for (const clause of clauses) {
    for (const title of titles) if (keywords(title).some((k) => holds(clause, k))) covered.add(title);
  }
  return covered.size >= minClauses && clauses.length >= minClauses;
}

export default {
  id: "outline-conclusion",
  feature: "aiWriting",
  category: {
    id: "outline-conclusion",
    label: "outline-restating conclusions",
    description: "A closing paragraph that re-lists the section headings instead of adding a new fact.",
    tags: ["rhetorical"],
  },
  source: "Wikipedia:Signs of AI writing (outline-like conclusions) and tropes.fyi fractal summaries",
  presets: ["ryan", "all"],
  scope: ["files", "gh", "reply"],
  notes: "Needs 300 words, three headings, a closing paragraph that echoes three section titles, and a restatement cue. A closing paragraph that adds a new fact passes.",
  options: { minWords: 300, minHeadings: 3, minOverlap: 3, minRatio: 0.6, smallDoc: 4, maxParagraphWords: 120 },
  detect(text, ctx) {
    const o = ctx.options;
    if (ctx.stats.words().length < o.minWords) return [];
    const heads = ctx.stats.headings();
    if (heads.length < o.minHeadings) return [];
    const closing = heads.find((h) => CLOSING.test(h.title));
    const para = candidate(text, ctx.stats, closing);
    if (!para || LIST_LINE.test(para.text)) return [];
    if ((para.text.match(/\S+/g) || []).length > o.maxParagraphWords) return [];
    const titles = heads.filter((h) => h !== closing).map((h) => h.title);
    if (titles.length < o.minHeadings - (closing ? 1 : 0)) return [];
    const hit = titles.filter((t) => keywords(t).some((k) => holds(para.text, k)));
    const small = titles.length <= o.smallDoc && hit.length / titles.length >= o.minRatio;
    if (hit.length < o.minOverlap && !small) return [];
    if (!restates(para.text, titles, o.minOverlap)) return [];
    const shown = `closing paragraph re-lists ${hit.length} of ${titles.length} headings: ${hit.join(", ")}`;
    return [{ index: para.start, match: shown.slice(0, 79), fix: "end on the last new fact" }];
  },
};
