import { cv, wordCount, startOf } from "../../stats-shared.mjs";

export default {
  id: "sentence-variation",
  feature: "aiWriting",
  category: {
    id: "sentence-variation",
    label: "sentence variation",
    description: "Flags text where every sentence runs about the same length.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["ryan", "statistical", "all"],
  options: { minWords: 160, minSentences: 8, minCv: 0.35 },
  notes: "Sentence-length burstiness, the coefficient of variation of words per sentence.",
  detect(text, ctx) {
    const o = ctx.options;
    const sentences = ctx.stats.sentences();
    if (ctx.stats.words().length < o.minWords || sentences.length < o.minSentences) return [];
    const lengths = sentences.map((s) => wordCount(s.text));
    const score = cv(lengths);
    if (score === 0 || score >= o.minCv) return [];
    const match = `sentence-length CV ${score.toFixed(2)} over ${sentences.length} sentences (min ${o.minCv})`;
    return [{ index: startOf(ctx.stats), match, fix: "vary sentence length" }];
  },
};
