import { words } from "./text-stats.mjs";

const TOKEN = /^[a-z][a-z'’-]*$/;

export const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "is", "are",
  "was", "were", "be", "been", "being", "this", "that", "these", "those", "it", "its", "as", "by",
  "from", "into", "than", "then", "so", "if", "we", "you", "they",
]);

/** The token rule the statistical packs share: lowercase, letters only, no bare numbers. */
export function tokensOf(stats) {
  return stats.words().map((w) => w.text.toLowerCase()).filter((t) => TOKEN.test(t));
}

export const tokensIn = (text) => words(text).map((w) => w.text.toLowerCase()).filter((t) => TOKEN.test(t));

export const wordCount = (text) => words(text).length;

// Table rows are data, so the statistical packs read the prose lines only. Offsets stay put.
export const blankTables = (text) =>
  text.replace(/^[ \t]*\|.*$/gm, (line) => " ".repeat(line.length));

export const mean = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

export function stdev(nums) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((sum, n) => sum + (n - m) ** 2, 0) / (nums.length - 1));
}

export function cv(nums) {
  const m = mean(nums);
  return m > 0 ? stdev(nums) / m : 0;
}

export const startOf = (stats) => (stats.sentences()[0] || { start: 0 }).start;

export const pct = (ratio) => `${Math.round(ratio * 100)}%`;

export const counts = (items) => {
  const map = new Map();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return map;
};
