const CLUSTERS = [
  ["function", "method", "routine"],
  ["change", "modification", "tweak", "alteration"],
  ["issue", "bug", "defect", "flaw"],
  ["approach", "strategy", "technique"],
  ["developer", "engineer", "programmer"],
  ["error", "mistake", "fault"],
];

const wordRe = (word) => new RegExp(`\\b${word}s?\\b`, "gi");
const COUNTERS = CLUSTERS.map((members) => members.map((word) => ({ word, re: wordRe(word) })));

function usedOnce(paragraph, cluster) {
  const hit = [];
  for (const member of cluster) {
    member.re.lastIndex = 0;
    const found = paragraph.match(member.re) || [];
    if (found.length > 1) return [];
    if (found.length === 1) hit.push({ word: member.word, at: paragraph.search(member.re) });
  }
  return hit.sort((a, b) => a.at - b.at).map((h) => h.word);
}

export default {
  id: "elegant-variation",
  feature: "aiWriting",
  category: {
    id: "elegant-variation",
    label: "elegant variation",
    description: "Rotating synonyms for one referent instead of repeating the name.",
    tags: ["rhetorical"],
  },
  source: "Fowler via Wikipedia:Elegant variation and Wikipedia:The problem with elegant variation",
  presets: ["ryan", "all"],
  scope: ["files", "gh", "reply"],
  notes: "The counting half needs 200 words and three synonyms from one cluster, each used once. Repeating a word turns the paragraph off.",
  options: { minWords: 200, minSynonyms: 3 },
  patterns: [
    { phrase: "aforementioned", fix: "name it again" },
    { phrase: "the eponymous", fix: "name it directly" },
    { phrase: "self-titled", fix: "name it directly" },
    { phrase: "the titular", fix: "name it directly" },
    { phrase: "of the same name", fix: "name it directly, or cut" },
  ],
  detect(text, ctx) {
    if (ctx.stats.words().length < ctx.options.minWords) return [];
    const out = [];
    for (const para of ctx.stats.paragraphs()) {
      if (!para.text.trim()) continue;
      for (const cluster of COUNTERS) {
        const used = usedOnce(para.text, cluster);
        if (used.length < ctx.options.minSynonyms) continue;
        out.push({
          index: para.start,
          match: `cycles through ${used.length} words for one thing: ${used.join(", ")}`.slice(0, 79),
          fix: "reuse one term, or a pronoun",
        });
        break;
      }
    }
    return out;
  },
};
