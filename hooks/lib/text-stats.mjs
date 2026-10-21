const WORD = /[\p{L}\p{N}](?:[\p{L}\p{N}'’-]*[\p{L}\p{N}])?/gu;
const SENTENCE_END = /[.!?]+/g;
const PARAGRAPH_GAP = /\n[ \t]*\n/g;
const LIST_MARKER = /^[ \t]*([-*+]|\d+[.)])[ \t]+/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*)$/;
const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs"]);

const span = (text, start, end) => ({ text: text.slice(start, end), start, end });

export function words(text) {
  WORD.lastIndex = 0;
  const out = [];
  for (const m of text.matchAll(WORD)) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

// The tail before a period: "e.g", "etc", or a single initial keeps the sentence open.
function isAbbreviation(before) {
  const tail = (/[A-Za-z.]+$/.exec(before) || [""])[0].toLowerCase();
  return tail.length === 1 || ABBREVIATIONS.has(tail);
}

function pushSentence(out, text, from, to) {
  const raw = text.slice(from, to);
  const lead = raw.length - raw.trimStart().length;
  const body = raw.trim();
  if (body) out.push({ text: body, start: from + lead, end: from + lead + body.length });
}

export function sentences(text) {
  const out = [];
  let start = 0;
  let m;
  SENTENCE_END.lastIndex = 0;
  while ((m = SENTENCE_END.exec(text)) !== null) {
    const stop = m.index + m[0].length;
    const next = text[stop];
    if (next !== undefined && !/\s/.test(next)) continue;
    if (m[0] === "." && isAbbreviation(text.slice(start, m.index))) continue;
    pushSentence(out, text, start, stop);
    start = stop;
  }
  pushSentence(out, text, start, text.length);
  return out;
}

export function paragraphs(text) {
  const out = [];
  let start = 0;
  let m;
  PARAGRAPH_GAP.lastIndex = 0;
  while ((m = PARAGRAPH_GAP.exec(text)) !== null) {
    out.push(span(text, start, m.index));
    start = PARAGRAPH_GAP.lastIndex;
  }
  out.push(span(text, start, text.length));
  return out;
}

export function lines(text) {
  const out = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf("\n", start);
    out.push(span(text, start, nl === -1 ? text.length : nl));
    if (nl === -1) return out;
    start = nl + 1;
  }
}

export function listBlocks(text) {
  const blocks = [];
  let open = null;
  for (const line of lines(text)) {
    const m = LIST_MARKER.exec(line.text);
    if (m) {
      if (!open) blocks.push((open = { start: line.start, end: line.end, items: [] }));
      open.items.push({ text: line.text, start: line.start, end: line.end, marker: m[1] });
      open.end = line.end;
    } else if (open && line.text.trim() !== "") {
      const item = open.items[open.items.length - 1];
      item.text += `\n${line.text}`;
      item.end = line.end;
      open.end = line.end;
    } else open = null;
  }
  return blocks.map((b) => ({ ...span(text, b.start, b.end), items: b.items }));
}

export function headings(text) {
  const out = [];
  for (const line of lines(text)) {
    const m = HEADING.exec(line.text);
    if (m) out.push({ ...line, level: m[1].length, title: m[2].trim() });
  }
  return out;
}

export function syllables(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, "");
  if (w === "") return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

const HELPERS = { words, sentences, paragraphs, lines, listBlocks, headings };

/** One memoized view of a text, handed to script packs as `ctx.stats`. */
export function makeStats(text) {
  const cache = new Map();
  const stats = { text, syllables };
  for (const [name, fn] of Object.entries(HELPERS)) {
    stats[name] = () => {
      if (!cache.has(name)) cache.set(name, fn(text));
      return cache.get(name);
    };
  }
  return stats;
}
