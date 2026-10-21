const PRAISE = [
  "great work",
  "nice job",
  "great job",
  "well done",
  "awesome work",
  "fantastic",
  "excellent work",
  "solid work",
  "good job",
  "amazing",
  "love this",
  "looks great",
  "really nice",
  "impressive",
  "kudos",
  "thanks for this",
  "overall, nice",
  "overall, this looks good",
  "overall, great",
];

const CRITIQUE = [
  "however",
  "that said",
  "on the other hand",
  "one issue",
  "one concern",
  "a few issues",
  "needs work",
  "should fix",
  "consider",
  "i'd suggest",
  "nit:",
  "nitpick",
  "missing",
  "doesn't handle",
  "could be improved",
  "would be better",
  "problem is",
  "concern is",
];

const flat = (text) => text.toLowerCase().replace(/[‘’]/g, "'");
const has = (text, markers) => markers.some((marker) => flat(text).includes(marker));

export default {
  id: "praise-sandwich",
  feature: "aiWriting",
  category: {
    id: "praise-sandwich",
    label: "praise sandwich",
    description: "Review or reply text opens and closes with praise around a middle critique.",
    tags: ["review"],
  },
  source: "Group G research: Wikipedia compliment sandwich, Radical Candor feedback sandwich",
  presets: ["ryan", "git", "all"],
  scope: ["gh", "reply"],
  options: { minParagraphs: 3, minWords: 18 },
  notes: "Needs praise in the first and last paragraph and a critique marker between them. People are taught this shape too, so the pack stays out of the `default` preset.",
  patterns: [],
  detect(text, ctx) {
    const paras = ctx.stats.paragraphs().filter((para) => para.text.trim() !== "");
    if (paras.length < 3 || paras.length < ctx.options.minParagraphs) return [];
    if (ctx.stats.words().length < ctx.options.minWords) return [];
    const first = paras[0];
    const last = paras[paras.length - 1];
    if (!has(first.text, PRAISE) || !has(last.text, PRAISE)) return [];
    if (!paras.slice(1, -1).some((para) => has(para.text, CRITIQUE))) return [];
    return [{
      index: first.start,
      match: `praise-critique-praise across ${paras.length} paragraphs`,
      fix: "state the critique, cut the praise",
    }];
  },
};
