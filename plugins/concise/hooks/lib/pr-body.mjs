import { fileFlagPaths, readMessageFile, segmentFrom, unquote } from "./shell-text.mjs";

// The terminator is anchored to its own line (tabs allowed, for `<<-`) so a body
// that merely mentions "EOF" mid-line doesn't truncate the capture.
export const HEREDOC = /<<[-~]?['"]?(\w+)['"]?\r?\n([\s\S]*?)\r?\n\t*\1(?=\r?\n|$)/;
const HEREDOC_G = new RegExp(HEREDOC.source, "g");
const MASKED_BODY = /\{\{concise-heredoc-(\d+)\}\}/;

/** The command with each heredoc swapped for a placeholder; `bodyIn(text)` is the body of the first placeholder in `text`. */
export function maskHeredocs(command) {
  const bodies = [];
  const masked = command.replace(HEREDOC_G, (_full, _tag, body) => `{{concise-heredoc-${bodies.push(body) - 1}}}`);
  return { masked, bodies, bodyIn: (text) => bodies[MASKED_BODY.exec(text)?.[1]] ?? null };
}

/** A `gh` command that posts a title or body. */
export const GH_COMMAND = /\bgh\s+(?:(?:pr|issue)\s+(?:create|comment|edit|review|merge)|release\s+(?:create|edit))\b/;

/** The body of a `gh pr`, `gh issue`, or `gh release` command: heredoc, quoted flag, or body file. */
export function extractBody(command, cwd = ".") {
  const heredoc = HEREDOC.exec(command);
  if (heredoc) return heredoc[2];

  const dq = /(?:--body|-b|--notes|-n)[= ]"((?:[^"\\]|\\.)*)"/.exec(command);
  if (dq) return dq[1];
  const sq = /(?:--body|-b|--notes|-n)[= ]'((?:[^'\\]|\\.)*)'/.exec(command);
  if (sq) return sq[1];

  const [file] = fileFlagPaths(command);
  return file ? readMessageFile(file, { cwd, command }) : null;
}

const TITLE = /(?:^|\s)(?:--title|--subject|-t)[= ](?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/;

/** The quoted `--title`, `--subject`, or `-t` value of a gh command, outside its heredocs. */
export function extractTitle(command) {
  const m = TITLE.exec(maskHeredocs(command).masked);
  return m ? (m[1] ?? m[2]) : null;
}

const API_CALL = /\bgh\s+api\b/g;
const WORD = String.raw`((?:"(?:[^"\\]|\\.)*"|'[^']*'|\\.|[^\s"'\\])+)`;
const API_FIELD = new RegExp(String.raw`(?:^|\s)(-[fF]|--(?:raw-)?field)(?:=|\s+)` + WORD, "g");
const API_INPUT = new RegExp(String.raw`(?:^|\s)--input(?:=|\s+)` + WORD);
const API_KEYS = ["body", "message", "description", "title"];

function jsonFields(text) {
  try {
    return Object.entries(JSON.parse(text)).filter(([key, value]) => API_KEYS.includes(key) && typeof value === "string").map(([, value]) => value);
  } catch {
    return [];
  }
}

/** The text fields of each `gh api` call: `-f`/`-F` values, `-F key=@file`, and the top-level strings of `--input` JSON. */
export function apiFields(command, cwd = ".") {
  if (typeof command !== "string" || !command.match(API_CALL)) return [];
  const { masked, bodyIn } = maskHeredocs(command);
  const out = [];
  for (const call of masked.matchAll(API_CALL)) {
    const segment = segmentFrom(masked, call.index);
    const read = (path) => (path === "-" ? bodyIn(segment) : readMessageFile(path, { cwd, command }));
    for (const [, flag, word] of segment.matchAll(API_FIELD)) {
      const [key, value = ""] = unquote(word).split(/=(.*)/s);
      if (!API_KEYS.includes(key)) continue;
      // Only the typed `-F` form reads `@file`; a raw `-f` value is literal text.
      const typed = flag === "-F" || flag === "--field";
      out.push(typed && value.startsWith("@") ? read(value.slice(1)) : bodyIn(value) ?? unquote(value));
    }
    const input = API_INPUT.exec(segment);
    if (input) out.push(...jsonFields(read(unquote(input[1]))));
  }
  return out.filter(Boolean);
}

const STRUCTURAL = [/^#{1,6}\s/, /^[-*]\s/, /^\d+\.\s/, /^>/];
const isStructural = (trimmed) => trimmed === "" || STRUCTURAL.some((re) => re.test(trimmed));

// Flags prose paragraphs, not structure: a "## Summary" + bullets body always
// passes, walls of prose don't.
export function isVerbose(body, { maxParagraphs, maxSentences }) {
  const paragraphs = [];
  let current = [];
  let inFence = false;

  for (const line of body.split("\n")) {
    const t = line.trim();
    if (/^```/.test(t)) inFence = !inFence;
    if (inFence) continue;

    if (isStructural(t)) {
      if (current.length) paragraphs.push(current.join(" "));
      current = [];
    } else {
      current.push(t);
    }
  }
  if (current.length) paragraphs.push(current.join(" "));

  if (paragraphs.length > maxParagraphs) {
    return {
      verbose: true,
      reason: `${paragraphs.length} prose paragraphs (limit ${maxParagraphs}), use short bullets instead`,
    };
  }

  for (const p of paragraphs) {
    const sentenceCount = (p.match(/[.!?](\s|$)/g) || []).length || 1;
    if (sentenceCount > maxSentences) {
      return {
        verbose: true,
        reason: `a paragraph has ${sentenceCount} sentences (limit ${maxSentences}), cut it down`,
      };
    }
  }

  return { verbose: false };
}
