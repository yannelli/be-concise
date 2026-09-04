import { tokensOf, startOf } from "../../stats-shared.mjs";

// Mean segmental TTR: raw type-token ratio falls as a text grows, segment means do not.
function msttr(tokens, size, tail) {
  const scores = [];
  for (let at = 0; at < tokens.length; at += size) {
    const segment = tokens.slice(at, at + size);
    if (segment.length < size && segment.length < tail) break;
    scores.push(new Set(segment).size / segment.length);
  }
  return scores;
}

export default {
  id: "lexical-diversity",
  feature: "aiWriting",
  category: {
    id: "lexical-diversity",
    label: "lexical diversity",
    description: "Flags text that reuses the same words instead of varying vocabulary.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["statistical", "all"],
  options: { minWords: 150, minRatio: 0.55, segment: 100, tailSegment: 50 },
  notes: "Mean segmental type-token ratio over 100-word segments. Direction of the academic signal is contested, so it stays out of the ryan preset.",
  detect(text, ctx) {
    const o = ctx.options;
    const tokens = tokensOf(ctx.stats);
    if (tokens.length < o.minWords) return [];
    const scores = msttr(tokens, o.segment, o.tailSegment);
    if (scores.length === 0) return [];
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (score >= o.minRatio) return [];
    const match = `MSTTR-${o.segment} ${score.toFixed(2)} over ${scores.length} segments (min ${o.minRatio})`;
    return [{ index: startOf(ctx.stats), match, fix: "vary word choice" }];
  },
};
