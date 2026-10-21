// stripCode blanks code spans before packs run, so this check reads ctx.raw.
// Without the engine change in engine.patch, ctx.raw is undefined and the pack reports nothing.
const LEAD = String.raw`\b(?:from|into|onto|against|off|to|on|of|rebased? on|merged? into|checkout|switch to|pushed? to)\s+`;

function branchPattern(branches) {
  const names = branches.map((b) => b.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|");
  return new RegExp(`${LEAD}(?<lead>\`(?:${names})\`)|(?<tail>\`(?:${names})\`)(?=\\s+branch(?:es)?\\b)`, "gi");
}

export default {
  id: "backtick-branches",
  feature: "aiWriting",
  category: "claude-tells",
  scope: ["gh", "commit", "reply"],
  presets: ["default", "ryan", "technical", "all"],
  options: { branches: ["main", "master", "dev", "develop", "development", "staging", "stage", "production", "prod", "release", "trunk", "next", "beta", "canary"] },
  notes: "Flags a branch name in backticks after `from`, `into`, `onto`, `against`, or a similar word, or before `branch`. Prose files stay out of scope: docs often set branch names as code by convention. Set `options.branches` to match the repo's branch names.",
  detect(text, ctx) {
    if (typeof ctx.raw !== "string" || ctx.raw.length !== text.length) return [];
    const re = branchPattern(ctx.options.branches || []);
    const out = [];
    for (const m of ctx.raw.matchAll(re)) {
      const hit = m.groups.lead || m.groups.tail;
      out.push({ index: m.index + m[0].indexOf(hit), match: hit, fix: "drop the backticks around the branch name" });
    }
    return out;
  },
};
