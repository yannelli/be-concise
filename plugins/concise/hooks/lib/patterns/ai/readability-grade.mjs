import { startOf } from "../../stats-shared.mjs";

const grade = (w, s, syl) => 0.39 * (w / s) + 11.8 * (syl / w) - 15.59;

function densest(stats, max) {
  for (const sentence of stats.sentences()) {
    const words = sentence.text.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    if (words.length < 8) continue;
    const syl = words.reduce((sum, word) => sum + stats.syllables(word), 0);
    if (grade(words.length, 1, syl) > max) return sentence.start;
  }
  return startOf(stats);
}

export default {
  id: "readability-grade",
  feature: "aiWriting",
  category: {
    id: "readability-grade",
    label: "readability grade",
    description: "Flags text with a Flesch-Kincaid grade level above what technical writing needs.",
    tags: ["statistical"],
  },
  scope: ["files", "gh", "reply"],
  presets: ["ryan", "statistical", "all"],
  options: { minWords: 150, minSentences: 5, maxGrade: 16 },
  notes: "Flesch-Kincaid grade level over the whole text. It reads register, and says nothing about who wrote the text.",
  detect(text, ctx) {
    const o = ctx.options;
    const words = ctx.stats.words();
    const sentences = ctx.stats.sentences();
    if (words.length === 0 || sentences.length === 0) return [];
    if (words.length < o.minWords || sentences.length < o.minSentences) return [];
    const syl = words.reduce((sum, w) => sum + ctx.stats.syllables(w.text), 0);
    const score = grade(words.length, sentences.length, syl);
    if (score <= o.maxGrade) return [];
    const match = `Flesch-Kincaid grade ${score.toFixed(1)} over ${words.length} words (max ${o.maxGrade})`;
    return [{ index: densest(ctx.stats, o.maxGrade), match, fix: "shorten sentences and words" }];
  },
};
