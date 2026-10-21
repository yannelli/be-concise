import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

const MAX_ENTRIES = 2000;
const MAX_BYTES = 256 * 1024;
const SNIFF_BYTES = 8192;
const GIT_OPTIONS = { encoding: "utf8", timeout: 3000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] };
const HUNK = /^@@+ [^+]*\+(\d+)/;

// Literal pathspecs, so a file named `a[1].md` does not match `a1.md` as a glob.
function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, "--literal-pathspecs", ...args], GIT_OPTIONS);
  } catch {
    return null;
  }
}

/** The path with symlinks resolved, so a path from the command and a path from git compare equal. */
export function realPath(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

/** Tracked files with unstaged changes and untracked files git does not ignore, as { root, rel, path, tracked }. */
export function gitChanges(cwd) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  const root = top && realPath(top.trim());
  const listed = root && git(root, ["ls-files", "-t", "-m", "-o", "--exclude-standard", "-z"]);
  if (!listed) return [];
  const entries = [...new Set(listed.split("\0"))].filter(Boolean).slice(0, MAX_ENTRIES);
  return entries.map((entry) => ({ root, rel: entry.slice(2), path: join(root, entry.slice(2)), tracked: !entry.startsWith("?") }));
}

/** The file's text when it changed at or after `since`, or null when it is older, too big, binary, or gone. */
export function readChanged(path, since) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.mtimeMs < since || stat.size > MAX_BYTES) return null;
    const bytes = readFileSync(path);
    return bytes.subarray(0, SNIFF_BYTES).includes(0) ? null : bytes.toString("utf8");
  } catch {
    return null;
  }
}

/** The text a change added, as { text, start }: the whole untracked file, or each hunk of the work tree diff. */
export function addedChunks(file, text) {
  if (!file.tracked) return [{ text, start: 1 }];
  const diff = git(file.root, ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "-U0", "--", file.rel]) || "";
  const hunks = [];
  for (const line of diff.split("\n")) {
    const header = HUNK.exec(line);
    if (header) hunks.push({ start: Number(header[1]), lines: [] });
    else if (hunks.length > 0 && line.startsWith("+")) hunks.at(-1).lines.push(line.slice(1));
  }
  return hunks.filter((hunk) => hunk.lines.length > 0).map((hunk) => ({ text: hunk.lines.join("\n"), start: hunk.start }));
}
