import { words } from "../../text-stats.mjs";
import { pct } from "../../stats-shared.mjs";

const BE = new Set(["am", "is", "are", "was", "were", "be", "being", "been"]);
const SKIPPABLE = new Set(["not", "never", "already", "also", "still", "just", "actually"]);
const IRREGULAR = new Set([
  "done", "gone", "seen", "known", "shown", "given", "taken", "made", "written", "said", "found", "held",
  "built", "brought", "bought", "caught", "taught", "thought", "sold", "told", "sent", "spent", "kept",
  "left", "lost", "meant", "met", "paid", "read", "run", "put", "cut", "hit", "set", "hurt", "cost",
  "understood", "chosen", "broken", "spoken", "driven", "risen", "fallen", "forgotten", "frozen", "grown",
  "hidden", "ridden", "shaken", "stolen", "sworn", "torn", "worn", "woven", "begun", "bitten", "blown",
  "born", "come", "drawn", "drunk", "eaten", "felt", "fought", "flown", "forbidden", "forgiven", "gotten",
  "ground", "laid", "led", "lent", "let", "lit", "proven", "rung", "sewn", "shone", "shot", "shrunk",
  "shut", "sung", "sunk", "sat", "slept", "slid", "spun", "split", "spread", "sprung", "stood", "stuck",
  "stung", "struck", "swept", "swollen", "swum", "swung", "thrown", "woken", "won", "wrung",
]);

const isParticiple = (w) => /^[a-z]+ed$/.test(w) || IRREGULAR.has(w);

// A be-verb, up to two adverbs or negators, then a participle.
function passiveAt(list, at) {
  for (let step = 1; step <= 3; step += 1) {
    const next = list[at + step];
    if (!next) return -1;
    if (isParticiple(next)) return at + step;
    if (step === 3 || !(SKIPPABLE.has(next) || /ly$/.test(next))) return -1;
  }
  return -1;
}

function passiveIn(sentence) {
  const list = words(sentence).map((w) => w.text.toLowerCase());
  for (let i = 0; i < list.length; i += 1) {
    if (!BE.has(list[i])) continue;
    const at = passiveAt(list, i);
    if (at !== -1) return { agent: list.slice(at + 1, at + 7).includes("by") };
  }
  return null;
}

export default {
  id: "passive-voice",
  feature: "aiWriting",
  category: {
    id: "passive-voice",
    label: "passive voice",
    description: "Flags text where passive voice runs past a third of the sentences.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["ryan", "statistical", "all"],
  options: { minWords: 150, minSentences: 8, maxRatio: 0.3 },
  notes: "Be-verb plus past participle, counted per sentence. Adjectival forms such as \"is committed\" are the known false positive.",
  detect(text, ctx) {
    const o = ctx.options;
    const sentences = ctx.stats.sentences();
    if (sentences.length === 0 || ctx.stats.words().length < o.minWords || sentences.length < o.minSentences) return [];
    const hits = sentences.map((s) => ({ s, hit: passiveIn(s.text) })).filter((r) => r.hit);
    const ratio = hits.length / sentences.length;
    if (ratio <= o.maxRatio) return [];
    const match = `passive voice ${pct(ratio)} of sentences over ${sentences.length} (max ${pct(o.maxRatio)})`;
    const fix = hits[0].hit.agent ? "name the actor first" : "use active voice";
    return [{ index: hits[0].s.start, match, fix }];
  },
};
