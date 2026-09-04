const STACKED = /\b(?:very|highly|deeply|particularly)\s+[a-z][\w-]*/gi;

export default {
  id: "undue-emphasis",
  feature: "aiWriting",
  category: {
    id: "undue-emphasis",
    label: "undue emphasis",
    description: "Intensifiers, stacked qualifiers, or markup used to manufacture stress.",
    tags: ["rhetorical"],
  },
  source: "Pangram signs-of-ai-writing frequency counts and Wikipedia:Manual of Style/Words to watch",
  presets: ["ryan", "all"],
  scope: ["files", "comments", "gh", "commit", "reply"],
  notes: "very, highly, deeply, and particularly report only when two of them share a sentence. A line-initial admonition label with a colon stays unflagged.",
  options: { minPairs: 2 },
  patterns: [
    { phrase: "extremely|remarkably|utterly|undeniably|unquestionably|exceptionally|tremendously|immensely", fix: "cut" },
    {
      regex: "[*_]{1,2}(?:critical|essential|important|vital|significant|must|note|warning)[*_]{1,2}",
      fix: "remove the bold, state the fact",
      show: "a stress word in bold or italics",
    },
    {
      regex: "(?<=[a-z] )\\b(?:NEVER|ALWAYS|MUST|REALLY|VERY|CRITICAL|IMPORTANT)\\b(?! *:)",
      fix: "use normal case",
      flags: "g",
      show: "a stress word in capitals mid-sentence",
    },
  ],
  detect(text, ctx) {
    const out = [];
    for (const sentence of ctx.stats.sentences()) {
      STACKED.lastIndex = 0;
      const pairs = sentence.text.match(STACKED) || [];
      if (pairs.length < ctx.options.minPairs) continue;
      const shown = pairs.slice(0, 3).map((p) => `"${p}"`).join(", ");
      out.push({ index: sentence.start, match: `${pairs.length} stacked intensifiers: ${shown}`.slice(0, 79), fix: "cut the intensifiers" });
    }
    return out;
  },
};
