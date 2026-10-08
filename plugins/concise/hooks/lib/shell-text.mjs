import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const MAX_BYTES = 256 * 1024;
// Unlike pr-body's HEREDOC, this one keeps the rest of the opener line, where `> file` can sit.
const HEREDOC_LINE = /<<[-~]?\s*(['"]?)(\w+)\1([^\n]*)\r?\n([\s\S]*?)\r?\n\t*\2(?=\r?\n|$)/g;
const TARGET = String.raw`("[^"\n]+"|'[^'\n]+'|[^\s;&|<>()]+)`;
const REDIRECT = new RegExp(String.raw`(?<![\d&])(>>?)\s*` + TARGET);
const TEE = new RegExp(String.raw`\btee\s+((?:-[a-z]+\s+)*)` + TARGET);
const FILE_FLAG = new RegExp(String.raw`(?:^|\s)(?:--body-file|--notes-file|--file|-[A-Za-z]*F)(?:=|\s*)` + TARGET, "g");

export const unquote = (value) => (/^(["']).*\1$/s.test(value) ? value.slice(1, -1) : value);

function writeOf(head, tail) {
  const tee = TEE.exec(tail) || TEE.exec(head);
  if (tee) return { path: unquote(tee[2]), append: /-\w*a/.test(tee[1]) };
  if (!/\bcat\b/.test(head)) return null;
  const redirect = REDIRECT.exec(tail) || REDIRECT.exec(head);
  return redirect ? { path: unquote(redirect[2]), append: redirect[1] === ">>" } : null;
}

/** Files that `cat` or `tee` write from a heredoc in this command, as { path, body, append }. */
export function heredocWrites(command) {
  if (typeof command !== "string" || !command.includes("<<")) return [];
  const out = [];
  for (const m of command.matchAll(HEREDOC_LINE)) {
    const head = command.slice(command.lastIndexOf("\n", m.index) + 1, m.index);
    const write = writeOf(head, m[3]);
    if (write && !write.path.startsWith("/dev/")) out.push({ ...write, body: m[4] });
  }
  return out;
}

/** Paths the command passes to `--body-file`, `--notes-file`, `--file`, or `-F`. */
export function fileFlagPaths(command) {
  if (typeof command !== "string") return [];
  return [...command.matchAll(FILE_FLAG)].map((m) => unquote(m[1]));
}

/** A message file's text: a heredoc write earlier in the same command wins over the file on disk. */
export function readMessageFile(path, { cwd = ".", command = "" } = {}) {
  if (!path || path === "-") return null;
  const full = resolve(cwd, path);
  const written = heredocWrites(command).find((w) => resolve(cwd, w.path) === full);
  if (written) return written.body;
  try {
    if (statSync(full).size > MAX_BYTES) return null;
    return readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

/** The text from `index` to the next `&&`, `||`, `;`, `|`, or newline outside quotes. */
export function segmentFrom(text, index) {
  let quote = null;
  for (let i = index; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\" && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ";" || ch === "|" || ch === "\n" || (ch === "&" && text[i + 1] === "&")) return text.slice(index, i);
  }
  return text.slice(index);
}
