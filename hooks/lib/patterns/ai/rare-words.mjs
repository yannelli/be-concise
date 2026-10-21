import { tokensOf, startOf, pct } from "../../stats-shared.mjs";

const COMMON = new Set([
  "information", "development", "organization", "application", "documentation", "implementation",
  "configuration", "environment", "government", "technology", "understanding", "requirement",
  "functionality", "performance", "infrastructure", "dependency", "repository", "integration",
  "authentication", "authorization", "initialization", "compatibility", "specification",
  "architecture", "deployment", "validation", "generation", "transformation", "communication",
  "description",
]);

export default {
  id: "rare-words",
  feature: "aiWriting",
  category: {
    id: "rare-words",
    label: "rare word usage",
    description: "Flags text with an unusually high share of long, low-frequency words.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["statistical", "all"],
  options: { minWords: 150, maxRatio: 0.25, minSyllables: 3, minLength: 7 },
  notes: "A length and syllable proxy for register inflation. The vocabulary pack covers the specific words with corpus evidence.",
  detect(text, ctx) {
    const o = ctx.options;
    const tokens = tokensOf(ctx.stats);
    if (tokens.length === 0 || tokens.length < o.minWords) return [];
    const rare = tokens.filter(
      (t) => t.length >= o.minLength && !COMMON.has(t) && ctx.stats.syllables(t) >= o.minSyllables,
    );
    const ratio = rare.length / tokens.length;
    if (ratio <= o.maxRatio) return [];
    const match = `rare-word ratio ${pct(ratio)} over ${tokens.length} words (max ${pct(o.maxRatio)})`;
    return [{ index: startOf(ctx.stats), match, fix: "use plainer words" }];
  },
};
