const MARKER = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/;
const BOLD_LEAD = /^\*\*[^*]+\*\*/;
const GERUND = /^[A-Za-z]+ing\b/i;

const body = (item) => item.text.replace(MARKER, "").trim();
const firstWord = (t) => (/^[\w'’*-]+/.exec(t) || [""])[0].toLowerCase();
const wordCount = (t) => (t.match(/\S+/g) || []).length;

function subTests(items, o) {
  const texts = items.map(body);
  const counts = texts.map(wordCount);
  const first = texts.map(firstWord);
  const found = [];
  if (texts.every((t) => BOLD_LEAD.test(t))) found.push({ name: "start with bold text", weight: o.strongWeight });
  if (first.every((w) => w === first[0] && w !== "")) found.push({ name: `start with "${first[0]}"`, weight: o.strongWeight });
  if (texts.every((t) => GERUND.test(t))) found.push({ name: "start with an -ing verb", weight: 1 });
  if (items.length >= o.lengthMinItems && Math.max(...counts) - Math.min(...counts) <= o.lengthSpread) {
    found.push({ name: "are the same length", weight: 1 });
  }
  return found;
}

export default {
  id: "parallel-bullets",
  feature: "aiWriting",
  category: {
    id: "parallel-bullets",
    label: "parallel bullets",
    description: "A bulleted list where every item shares one rigid shape.",
    tags: ["rhetorical"],
  },
  source: "Pangram signs-of-ai-writing bullet counts and tropes.fyi bold-first bullets and anaphora abuse",
  presets: ["ryan", "all"],
  scope: ["files", "gh", "reply"],
  notes: "A bold lead-in or one shared opening word across every item is enough on its own. The two weaker shapes need a second one.",
  options: { minItems: 3, minScore: 2, strongWeight: 2, lengthSpread: 1, lengthMinItems: 4 },
  detect(text, ctx) {
    const o = ctx.options;
    const out = [];
    for (const block of ctx.stats.listBlocks()) {
      if (block.items.length < o.minItems) continue;
      const found = subTests(block.items, o);
      if (found.reduce((sum, t) => sum + t.weight, 0) < o.minScore) continue;
      const shown = `${block.items.length} bullets all ${found.map((t) => t.name).join(" and all ")}`;
      out.push({ index: block.start, match: shown.slice(0, 79), fix: "vary the openings, or use prose" });
    }
    return out;
  },
};
