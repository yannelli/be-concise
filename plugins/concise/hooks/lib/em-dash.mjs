import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lineIndexer } from "./prose.mjs";

const PACK_PATH = join(dirname(fileURLToPath(import.meta.url)), "patterns", "prose", "em-dash.json");
const SNIPPET_WIDTH = 40;

function packPatterns() {
  try {
    return JSON.parse(readFileSync(PACK_PATH, "utf8")).patterns || [];
  } catch {
    return [];
  }
}

const PATTERNS = packPatterns();

function snippetAround(text, index, length) {
  const pad = Math.max(0, Math.floor((SNIPPET_WIDTH - length) / 2));
  const slice = text.slice(Math.max(0, index - pad), index + length + pad);
  return slice.replace(/\s+/g, " ").trim();
}

export function findDashes(text, { enDash = true, doubleHyphen = false } = {}) {
  if (typeof text !== "string" || text === "") return [];
  const on = { enDash, doubleHyphen };
  const sources = PATTERNS.filter((p) => !p.option || on[p.option]).map((p) => p.regex);
  if (sources.length === 0) return [];

  const re = new RegExp(sources.join("|"), "g");
  const at = lineIndexer(text);
  const found = [];
  for (const m of text.matchAll(re)) {
    const { line, col } = at(m.index);
    found.push({ line, col, char: m[0], snippet: snippetAround(text, m.index, m[0].length) });
  }
  return found;
}
