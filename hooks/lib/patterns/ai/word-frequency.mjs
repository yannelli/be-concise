import { tokensIn, startOf, counts, blankTables, STOPWORDS } from "../../stats-shared.mjs";

export default {
  id: "word-frequency",
  feature: "aiWriting",
  category: {
    id: "word-frequency",
    label: "word frequency",
    description: "Flags text that leans on one favorite word far more than natural word spread predicts.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["statistical", "all"],
  options: { minWords: 200, maxShare: 0.035 },
  notes: "Share of the text taken by its most repeated content word. The research's Zipf exponent is unreachable at this text size, so the share replaces it.",
  detect(text, ctx) {
    const o = ctx.options;
    const tokens = tokensIn(blankTables(text));
    if (tokens.length < o.minWords) return [];
    const ranked = [...counts(tokens.filter((t) => !STOPWORDS.has(t)))].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0) return [];
    const [word, n] = ranked[0];
    const share = n / tokens.length;
    if (share <= o.maxShare) return [];
    const shown = `${(share * 100).toFixed(1)}%`;
    const max = `${(o.maxShare * 100).toFixed(1)}%`;
    const match = `word "${word}" ${shown} over ${tokens.length} words (max ${max})`;
    return [{ index: startOf(ctx.stats), match, fix: "vary repeated key terms" }];
  },
};
