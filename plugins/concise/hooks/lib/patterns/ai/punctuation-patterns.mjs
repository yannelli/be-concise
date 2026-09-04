import { sentences, words } from "../../text-stats.mjs";
import { startOf, blankTables } from "../../stats-shared.mjs";

const OXFORD = /[A-Za-z][\w'’-]*,\s+(?:[A-Za-z][\w'’-]*,\s+)*[A-Za-z][\w'’-]*(,)?\s+(?:and|or)\s+[A-Za-z]/g;
const LEAD = /^[\s>*+-]*(?:\d+[.)]\s*)?/;
const CONJUNCTION = /^(?:but|and|so|yet)\b/i;

const rate = (text, char, n) => (text.split(char).length - 1) / n;

function signals(text, ctx) {
  const o = ctx.options;
  const parts = sentences(text);
  const found = [];
  if (parts.length === 0) return found;
  if (rate(text, ":", parts.length) > o.colonRate) found.push("colons");
  if (rate(text, ";", parts.length) > o.semicolonRate) found.push("semicolons");
  const structured = ctx.stats.headings().length > 0 || ctx.stats.listBlocks().length > 0;
  if (!text.includes("!") && words(text).length >= o.exclamationWords && structured) found.push("no !");
  const lists = [...text.matchAll(OXFORD)];
  if (lists.length >= o.oxfordMin && lists.every((m) => m[1])) found.push("oxford");
  const opens = parts.some((s) => CONJUNCTION.test(s.text.replace(LEAD, "")));
  if (parts.length >= o.conjunctionSentences && !opens) found.push("no and/but");
  return found;
}

export default {
  id: "punctuation-patterns",
  feature: "aiWriting",
  category: {
    id: "punctuation-patterns",
    label: "punctuation patterns",
    description: "Flags punctuation habits that agree: colon and semicolon rate, no exclamations, a uniform Oxford comma, no sentence-initial conjunctions.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["statistical", "all"],
  options: {
    minWords: 150,
    colonRate: 0.15,
    semicolonRate: 0.1,
    exclamationWords: 300,
    oxfordMin: 6,
    conjunctionSentences: 20,
    minScore: 4,
  },
  notes: "Each sub-signal is weak alone. The pack reports only when four of the five agree.",
  detect(text, ctx) {
    const o = ctx.options;
    if (ctx.stats.words().length < o.minWords || ctx.stats.sentences().length === 0) return [];
    const found = signals(blankTables(text), ctx);
    if (found.length < o.minScore) return [];
    const match = `punctuation signals ${found.length}/5: ${found.join(", ")} (min ${o.minScore}/5)`;
    return [{ index: startOf(ctx.stats), match, fix: "vary punctuation and structure" }];
  },
};
