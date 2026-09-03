import { lineIndexer } from "./prose.mjs";

const EM = "—";
const EN = "–";
const DOUBLE_HYPHEN = "(?<=\\w)--(?=\\w)|(?<=\\s)--(?=\\s)";
const SNIPPET_WIDTH = 40;

function snippetAround(text, index, length) {
  const pad = Math.max(0, Math.floor((SNIPPET_WIDTH - length) / 2));
  const slice = text.slice(Math.max(0, index - pad), index + length + pad);
  return slice.replace(/\s+/g, " ").trim();
}

export function findDashes(text, { enDash = true, doubleHyphen = false } = {}) {
  if (typeof text !== "string" || text === "") return [];
  const alternatives = [EM];
  if (enDash) alternatives.push(EN);
  if (doubleHyphen) alternatives.push(DOUBLE_HYPHEN);

  const re = new RegExp(alternatives.join("|"), "g");
  const at = lineIndexer(text);
  const found = [];
  for (const m of text.matchAll(re)) {
    const { line, col } = at(m.index);
    found.push({ line, col, char: m[0], snippet: snippetAround(text, m.index, m[0].length) });
  }
  return found;
}
