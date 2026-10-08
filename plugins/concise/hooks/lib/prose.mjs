import { scanComments } from "./comment-scan.mjs";
import { HEREDOC } from "./pr-body.mjs";
import { readMessageFile, segmentFrom, unquote } from "./shell-text.mjs";

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
  if (isProsePath(path)) return [{ text: stripCode(text), raw: text, line: 1 }];
  return scanComments(text, path).map((run) => ({ text: run.text, raw: run.text, line: run.startLine }));
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

// `git -C dir commit`, `git -c k=v tag`, `git merge`, and `git notes add` all take a message.
const GIT_MESSAGE_COMMAND = /\bgit(?:\s+(?:-C\s+\S+|-c\s+\S+|--[\w-]+(?:=\S+)?))*\s+(?:commit|tag|merge|notes\s+(?:add|append|edit))\b/;
const QUOTED_OR_WORD = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s;&|]+)`;
const GIT_FILE_FLAG = new RegExp(String.raw`(?:^|\s)(?:--file(?:=|\s+)|-[A-Za-z]*F\s*)` + QUOTED_OR_WORD, "g");
const TRAILER_FLAG = new RegExp(String.raw`(?:^|\s)--trailer(?:=|\s+)` + QUOTED_OR_WORD, "g");

/** Message text from `-m`, `--message`, `-F`/`--file` (a file or a heredoc on stdin), and `--trailer`. */
export function gitCommitMessages(command, cwd = ".") {
  if (typeof command !== "string" || !GIT_MESSAGE_COMMAND.test(command)) return [];
  const { masked, bodies } = maskHeredocs(command);
  const messages = [];
  for (const m of masked.matchAll(MESSAGE_FLAG)) {
    const quoted = m[1].slice(1, -1);
    const body = MASKED_BODY.exec(quoted);
    messages.push(body ? bodies[Number(body[1])] : quoted);
  }
  const start = masked.search(GIT_MESSAGE_COMMAND);
  const segment = start === -1 ? "" : segmentFrom(masked, start);
  for (const m of segment.matchAll(GIT_FILE_FLAG)) {
    const path = unquote(m[1]);
    const body = path === "-" ? bodies[0] : readMessageFile(path, { cwd, command });
    if (body) messages.push(body);
  }
  const trailers = [...segment.matchAll(TRAILER_FLAG)].map((m) => unquote(m[1])).map((t) => (t.includes(":") ? t : t.replace("=", ": ")));
  if (trailers.length > 0) messages.push(trailers.join("\n"));
  return messages;
}
