import { words } from "../../text-stats.mjs";

const MARKER = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;

function fragments(blocks, maxWords) {
  const out = [];
  for (const block of blocks) {
    for (const item of block.items) {
      const body = item.text.replace(MARKER, "").trim();
      if (body === "" || words(body).length > maxWords) continue;
      out.push({ start: item.start, dotted: body.endsWith(".") && !body.endsWith("..") });
    }
  }
  return out;
}

export default {
  id: "terminal-punctuation",
  feature: "aiWriting",
  category: {
    id: "terminal-punctuation",
    label: "terminal punctuation uniformity",
    description: "Flags list items that all carry a trailing period even though they read as short fragments.",
    tags: ["statistical"],
  },
  scope: ["files", "gh"],
  presets: ["statistical", "all"],
  options: { minWords: 0, minItems: 8, minBlocks: 2, maxItemWords: 8 },
  notes: "List items only. Every declarative sentence ends in a period, so sentence-level uniformity carries no signal.",
  detect(text, ctx) {
    const o = ctx.options;
    if (ctx.stats.words().length < o.minWords) return [];
    const blocks = ctx.stats.listBlocks().filter((b) => b.items.length > 0);
    if (blocks.length < o.minBlocks) return [];
    const items = fragments(blocks, o.maxItemWords);
    if (items.length === 0 || items.length < o.minItems || !items.every((item) => item.dotted)) return [];
    const match = `${items.length}/${items.length} fragment list items end with '.' (min ${o.minItems} items, ${o.minBlocks}+ lists)`;
    return [{ index: items[0].start, match, fix: "drop periods from fragments" }];
  },
};
