const LINE_COMMENT_BY_EXT = {
  js: "//", jsx: "//", ts: "//", tsx: "//", mjs: "//", cjs: "//",
  java: "//", c: "//", h: "//", cpp: "//", cc: "//", hpp: "//",
  cs: "//", go: "//", rs: "//", kt: "//", kts: "//", swift: "//", scala: "//",
  py: "#", rb: "#", sh: "#", bash: "#", zsh: "#", yaml: "#", yml: "#",
  toml: "#", r: "#", pl: "#", ex: "#", exs: "#",
};

const BLOCK_COMMENT_BY_EXT = {
  js: ["/*", "*/"], jsx: ["/*", "*/"], ts: ["/*", "*/"], tsx: ["/*", "*/"],
  mjs: ["/*", "*/"], cjs: ["/*", "*/"], java: ["/*", "*/"], c: ["/*", "*/"],
  h: ["/*", "*/"], cpp: ["/*", "*/"], cc: ["/*", "*/"], hpp: ["/*", "*/"],
  cs: ["/*", "*/"], go: ["/*", "*/"], rs: ["/*", "*/"], css: ["/*", "*/"],
  scss: ["/*", "*/"], php: ["/*", "*/"], scala: ["/*", "*/"],
};

function extOf(filePath) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filePath);
  return m ? m[1].toLowerCase() : "";
}

// Returns each comment run in `content` as { startLine, length, text }: contiguous
// line comments, plus block spans. Heuristic, so a token in a string can misfire.
export function scanComments(content, filePath) {
  const ext = extOf(filePath);
  const runs = [];

  const lineToken = LINE_COMMENT_BY_EXT[ext];
  if (lineToken) {
    const lines = content.split("\n");
    let runStart = -1;
    let runLines = [];
    const flush = () => {
      if (runStart !== -1 && runLines.length > 0) {
        runs.push({ startLine: runStart + 1, length: runLines.length, text: runLines.join("\n") });
      }
      runStart = -1;
      runLines = [];
    };
    lines.forEach((line, i) => {
      if (line.trim().startsWith(lineToken)) {
        if (runStart === -1) runStart = i;
        runLines.push(line);
      } else {
        flush();
      }
    });
    flush();
  }

  const blockTokens = BLOCK_COMMENT_BY_EXT[ext];
  if (blockTokens) {
    const [open, close] = blockTokens;
    let searchFrom = 0;
    while (true) {
      const start = content.indexOf(open, searchFrom);
      if (start === -1) break;
      // Only openers that start their own line count. A real multi-line comment
      // always does, and this keeps "/*" inside a glob or URL from misfiring.
      if (!/(^|\n)[ \t]*$/.test(content.slice(0, start))) {
        searchFrom = start + open.length;
        continue;
      }
      const end = content.indexOf(close, start + open.length);
      if (end === -1) break;
      const span = content.slice(start, end + close.length);
      runs.push({
        startLine: content.slice(0, start).split("\n").length,
        length: span.split("\n").length,
        text: span,
      });
      searchFrom = end + close.length;
    }
  }

  return runs;
}
