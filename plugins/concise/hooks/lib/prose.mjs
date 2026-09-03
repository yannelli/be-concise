import { scanComments } from "./comment-scan.mjs";
import { HEREDOC } from "./pr-body.mjs";

export const PROSE_EXTENSIONS = ["md", "mdx", "markdown", "txt", "rst", "adoc", "asciidoc"];

const blank = (s) => s.replace(/[^\n]/g, " ");

function blankFences(text) {
  let open = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        open = !open;
        return blank(line);
      }
      return open ? blank(line) : line;
    })
    .join("\n");
}

export function stripCode(markdown) {
  return blankFences(markdown)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/`+[^`\n]*`+/g, blank)
    .replace(/https?:\/\/\S+/g, blank);
}

// One pass over the newlines, then binary search per lookup. Calling positionOf per
// match instead costs a slice of the whole text every time.
export function lineIndexer(text) {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: index - starts[lo] + 1 };
  };
}

export function extOf(filePath) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filePath || "");
  return m ? m[1].toLowerCase() : "";
}

export const isProsePath = (filePath) => PROSE_EXTENSIONS.includes(extOf(filePath));

export function proseSpans(text, path) {
  if (isProsePath(path)) return [{ text: stripCode(text), line: 1 }];
  return scanComments(text, path).map((run) => ({ text: run.text, line: run.startLine }));
}

const MESSAGE_FLAG = /(?:^|\s)(?:--message(?:=|\s+)|-[A-Za-z]*m\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
const HEREDOC_G = new RegExp(HEREDOC.source, "g");
const MASKED_BODY = /\{\{concise-heredoc-(\d+)\}\}/;

function maskHeredocs(command) {
  const bodies = [];
  const masked = command.replace(HEREDOC_G, (_full, _tag, body) => {
    bodies.push(body);
    return `{{concise-heredoc-${bodies.length - 1}}}`;
  });
  return { masked, bodies };
}

export function gitCommitMessages(command) {
  if (typeof command !== "string" || !/\bgit\s+commit\b/.test(command)) return [];
  const { masked, bodies } = maskHeredocs(command);
  const messages = [];
  for (const m of masked.matchAll(MESSAGE_FLAG)) {
    const quoted = m[1].slice(1, -1);
    const body = MASKED_BODY.exec(quoted);
    messages.push(body ? bodies[Number(body[1])] : quoted);
  }
  return messages;
}
