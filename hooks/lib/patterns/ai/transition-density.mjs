import { wordCount } from "../../stats-shared.mjs";

const MARKERS = [
  "moreover", "furthermore", "additionally", "however", "therefore", "thus", "consequently",
  "nonetheless", "nevertheless", "meanwhile", "subsequently", "overall", "in fact", "indeed",
  "in addition", "on the other hand", "as a result", "in conclusion", "in summary", "that said",
  "notably", "importantly", "interestingly", "ultimately", "for example", "for instance",
  "in other words", "at the same time", "by contrast", "in turn",
];

const OPENER = new RegExp(`\\b(?:${MARKERS.join("|")})\\b`, "i");
const LEAD = /^[\s>*+-]*(?:\d+[.)]\s*)?(?:\[[ xX]\]\s*)?/;

// A connector counts when it starts inside the sentence's first four words.
function opensOnMarker(sentence) {
  const head = sentence.text.replace(LEAD, "").split(/\s+/).slice(0, 4).join(" ");
  const m = OPENER.exec(head);
  return Boolean(m) && head.slice(0, m.index).split(/\s+/).filter(Boolean).length < 4;
}

export default {
  id: "transition-density",
  feature: "aiWriting",
  category: {
    id: "transition-density",
    label: "transition density",
    description: "Flags text where too many sentences open on a transition or connector word.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["ryan", "statistical", "all"],
  options: { minWords: 150, minSentences: 8, maxDensity: 0.3 },
  notes: "Document-wide connector rate. The transitions pack flags single openers; this one flags the habit.",
  detect(text, ctx) {
    const o = ctx.options;
    const sentences = ctx.stats.sentences();
    if (sentences.length === 0 || wordCount(text) < o.minWords || sentences.length < o.minSentences) return [];
    const hits = sentences.filter(opensOnMarker);
    const density = hits.length / sentences.length;
    if (density <= o.maxDensity) return [];
    const shown = `${Math.round(density * 100)}%`;
    const max = `${Math.round(o.maxDensity * 100)}%`;
    const match = `transition density ${shown} over ${sentences.length} sentences (max ${max})`;
    return [{ index: hits[0].start, match, fix: "cut some transition words" }];
  },
};
