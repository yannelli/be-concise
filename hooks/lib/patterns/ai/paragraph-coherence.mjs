import { words, sentences } from "../../text-stats.mjs";
import { cv, tokensIn, counts, pct, STOPWORDS } from "../../stats-shared.mjs";

const keyOf = (text) => new Set(tokensIn(text).filter((t) => !STOPWORDS.has(t)));

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function byLength(kept, o) {
  if (kept.length < o.minParagraphs) return null;
  const score = cv(kept.map((p) => p.count));
  if (score === 0 || score >= o.maxLengthCv) return null;
  const match = `paragraph length CV ${score.toFixed(2)} over ${kept.length} paragraphs (min ${o.maxLengthCv})`;
  return { index: kept[0].start, match, fix: "vary paragraph openings" };
}

function byFirstWord(kept, o) {
  if (kept.length < o.minRepeatParagraphs) return null;
  const ranked = [...counts(kept.map((p) => p.first))].sort((a, b) => b[1] - a[1]);
  const [word, n] = ranked[0] || ["", 0];
  if (!word || n < o.minFirstWordCount || n / kept.length <= o.firstWordShare) return null;
  const shown = word.charAt(0).toUpperCase() + word.slice(1);
  const match = `${n} of ${kept.length} paragraphs open with '${shown}' (max ${pct(o.firstWordShare)})`;
  return { index: kept.find((p) => p.first === word).start, match, fix: "vary paragraph openings" };
}

function byTopic(kept, o) {
  if (kept.length < o.minRepeatParagraphs) return null;
  const pairs = [];
  for (let i = 0; i < kept.length; i += 1) {
    for (let j = i + 1; j < kept.length; j += 1) {
      const score = jaccard(kept[i].topic, kept[j].topic);
      if (score > o.maxSimilarity) pairs.push({ score, at: kept[j].start });
    }
  }
  if (pairs.length < o.minPairs) return null;
  const top = Math.max(...pairs.map((p) => p.score));
  const match = `topic sentences ${pct(top)} similar across ${pairs.length} pairs (max ${pct(o.maxSimilarity)})`;
  return { index: pairs[0].at, match, fix: "vary topic sentences" };
}

const TABLE = /^[ \t]*\|/m;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/;

// A table block, a caption next to one, a list item, and a short template line are not body paragraphs.
function keptParagraphs(stats, minWords) {
  const all = stats.paragraphs();
  const table = all.map((p) => TABLE.test(p.text));
  return all
    .filter((p, i) => !table[i] && !table[i - 1] && !table[i + 1] && !LIST_ITEM.test(p.text))
    .map((p) => ({ ...p, parts: sentences(p.text) }))
    .filter((p) => p.parts.length >= 2 && words(p.text).length >= minWords)
    .map((p) => ({
      start: p.start,
      count: words(p.text).length,
      first: (tokensIn(p.text)[0] || ""),
      topic: keyOf(p.parts[0].text),
    }));
}

export default {
  id: "paragraph-coherence",
  feature: "aiWriting",
  category: {
    id: "paragraph-coherence",
    label: "paragraph coherence",
    description: "Flags formulaic paragraphs: near-identical lengths, repeated opening words, or repeated topic sentences.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["ryan", "statistical", "all"],
  options: {
    minWords: 300,
    minParagraphs: 4,
    minParagraphWords: 20,
    minRepeatParagraphs: 5,
    maxLengthCv: 0.15,
    firstWordShare: 0.6,
    minFirstWordCount: 3,
    maxSimilarity: 0.6,
    minPairs: 2,
  },
  notes: "Three proxies, any one of which reports on its own: length uniformity, first-word repetition, topic-sentence overlap.",
  detect(text, ctx) {
    const o = ctx.options;
    if (ctx.stats.words().length < o.minWords) return [];
    const kept = keptParagraphs(ctx.stats, o.minParagraphWords);
    const hit = byLength(kept, o) || byFirstWord(kept, o) || byTopic(kept, o);
    return hit ? [hit] : [];
  },
};
