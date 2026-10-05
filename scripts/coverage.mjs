import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const usage = `Usage: node scripts/coverage.mjs DIR

Reads the V8 coverage files that NODE_V8_COVERAGE=DIR wrote and exits 1
when a source line never ran. Sources are the .mjs files outside test directories.
A line that holds "coverage-ignore" is left out; use it for code no test can reach.
`;

// Blank lines, comment lines, and lines that only close a block hold no code to run.
const NOT_CODE = /^\s*$|^\s*(\/\/|\*|\/\*)|^\s*[}\])]+[;,)]*\s*$/;

function sources(root) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "*.mjs"], { cwd: root, encoding: "utf8" })
    .split("\0").filter((path) => path && !/(^|\/)test\//.test(path));
}

/** Marks every character that ran in at least one process. A later, inner range overrides the outer one. */
function readHits(root, dir, files) {
  for (const name of readdirSync(dir).filter((item) => item.endsWith(".json"))) {
    let scripts;
    try { scripts = JSON.parse(readFileSync(join(dir, name), "utf8")).result; } catch { continue; }
    for (const script of scripts) {
      if (!script.url.startsWith("file://")) continue;
      const file = files.get(relative(root, fileURLToPath(script.url)));
      if (!file) continue;
      file.loaded = true;
      const counts = new Int32Array(file.source.length);
      for (const fn of script.functions) {
        for (const range of fn.ranges) counts.fill(range.count, range.startOffset, range.endOffset);
      }
      counts.forEach((count, index) => { if (count > 0) file.hit[index] = 1; });
    }
  }
}

function missedLines(file) {
  const missed = [];
  let lines = 0;
  let offset = 0;
  file.source.split("\n").forEach((line, index) => {
    const start = offset;
    offset += line.length + 1;
    if (NOT_CODE.test(line) || line.includes("coverage-ignore")) return;
    lines += 1;
    if (!file.hit.subarray(start, start + line.length).includes(1)) missed.push(index + 1);
  });
  return { lines, missed };
}

function ranges(numbers) {
  const out = [];
  for (const number of numbers) {
    const last = out.at(-1);
    if (last && last[1] === number - 1) last[1] = number;
    else out.push([number, number]);
  }
  return out.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`)).join(",");
}

/** Line coverage for the sources under `root`, from the V8 coverage files in `dir`. */
export function coverage(root, dir) {
  const files = new Map(sources(root).map((path) => {
    const source = readFileSync(join(root, path), "utf8");
    return [path, { source, hit: new Uint8Array(source.length), loaded: false }];
  }));
  readHits(root, dir, files);
  const rows = [...files].map(([path, file]) => ({ path, loaded: file.loaded, ...missedLines(file) }));
  const lines = rows.reduce((sum, row) => sum + row.lines, 0);
  const missed = rows.reduce((sum, row) => sum + row.missed.length, 0);
  return { lines, missed, files: rows.filter((row) => row.missed.length) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write(usage);
    process.exit(2);
  }
  const result = coverage(process.cwd(), dir);
  for (const file of result.files) console.log(`${file.path}: ${file.loaded ? `lines ${ranges(file.missed)}` : "never loaded"}`);
  const percent = result.lines ? (100 * (result.lines - result.missed)) / result.lines : 100;
  console.log(`Line coverage ${percent.toFixed(2)}% (${result.lines - result.missed}/${result.lines})`);
  process.exit(result.missed ? 1 : 0);
}
