import { fileFlagPaths, readMessageFile } from "./shell-text.mjs";

// The terminator is anchored to its own line (tabs allowed, for `<<-`) so a body
// that merely mentions "EOF" mid-line doesn't truncate the capture.
export const HEREDOC = /<<[-~]?['"]?(\w+)['"]?\r?\n([\s\S]*?)\r?\n\t*\1(?=\r?\n|$)/;

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
