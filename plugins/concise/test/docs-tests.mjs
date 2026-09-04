#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok, bad, ROOT } from "./lib.mjs";
import { loadPacks } from "../hooks/lib/packs.mjs";
import {
  render,
  sections,
  flaggedCell,
  expandSource,
  partName,
  MARKER,
  COMMAND,
  MAX_LINES,
  REFERENCE_DIR,
} from "../scripts/render-patterns.mjs";

const RENDERER = join(ROOT, "scripts", "render-patterns.mjs");
const VALIDATOR = join(ROOT, "scripts", "validate-packs.mjs");
const NO_CWD = "/nonexistent-concise-cwd";
const dirs = [];

function tmp(name) {
  const dir = mkdtempSync(join(tmpdir(), `concise-${name}-`));
  dirs.push(dir);
  return dir;
}

function yes(name, condition, detail) {
  if (condition) return ok(name);
  bad(name, detail || "expected true");
}

const node = (script, args) => spawnSync("node", [script, ...args], { encoding: "utf8" });

console.log("\ndocs (rendered pattern reference)");

const loaded = await loadPacks({ cwd: NO_CWD });
const files = render(loaded.packs);
const list = sections(loaded.packs);

{
  const dir = tmp("docs-render");
  const res = node(RENDERER, ["--out", dir]);
  yes("the renderer writes the reference files", res.status === 0, res.stderr);
  const written = readdirSync(dir).sort();
  yes("it writes one file per part", written.length === files.size, `wrote ${written.join(", ")}`);
  const same = written.every((name) => readFileSync(join(dir, name), "utf8") === files.get(name));
  yes("the CLI output matches render()", same);
}

{
  const stale = [];
  for (const [name, content] of files) {
    const path = join(REFERENCE_DIR, name);
    let have = null;
    try {
      have = readFileSync(path, "utf8");
    } catch {
      have = null;
    }
    if (have !== content) stale.push(name);
  }
  const extra = readdirSync(REFERENCE_DIR).filter((n) => /^ai-speak-patterns(-\d+)?\.md$/.test(n) && !files.has(n));
  const off = [...stale, ...extra];
  if (off.length === 0) ok("the committed reference files are current");
  else bad("the committed reference files are current", `${off.join(", ")} differ. ${COMMAND}`);
}

{
  const res = node(RENDERER, ["--check"]);
  yes("--check exits 0 when the files are current", res.status === 0, res.stdout);
}

{
  const dir = tmp("docs-check");
  writeFileSync(join(dir, partName(0)), "stale\n");
  const res = node(RENDERER, ["--check", "--out", dir]);
  yes("--check exits 1 on a stale file", res.status === 1);
  yes("--check names the stale file", res.stdout.includes(partName(0)));
  yes("--check prints the command to run", res.stdout.includes(COMMAND), res.stdout);
}

{
  const long = [...files].filter(([, content]) => content.split("\n").length - 1 >= MAX_LINES);
  yes("every generated file stays under 300 lines", long.length === 0, long.map(([n]) => n).join(", "));
  const marked = [...files.values()].every((content) => content.startsWith(`${MARKER}\n`));
  yes("every generated file starts with the generated marker", marked);
}

{
  const part1 = files.get(partName(0));
  yes("part 1 holds the category index", part1.includes("| Category | Label | Pack | Presets | File |"));
  const lines = part1.split("\n");
  const head = lines.indexOf("|---|---|---|---|---|");
  const rows = lines.slice(head + 1, lines.indexOf("", head));
  yes("the index has one row per category", rows.length === list.length, `${rows.length} rows, ${list.length} categories`);
  const named = list.every((section) => part1.includes(`| \`${section.id}\` |`));
  yes("every category id appears in the index", named);
}

{
  const withShow = loaded.packs
    .filter((pack) => pack.builtin && pack.feature === "aiWriting")
    .flatMap((pack) => pack.patterns)
    .filter((entry) => typeof entry.show === "string" && entry.show !== "");
  yes("some built-in pattern carries a show", withShow.length > 0);
  const all = [...files.values()].join("\n");
  const missing = withShow.filter((entry) => !all.includes(`| ${entry.show} |`));
  yes("a pattern with show renders its show text", missing.length === 0, missing.map((e) => e.show).join(" / "));
  yes("show wins over the expansion", flaggedCell({ phrase: "delv(?:e|es)", fix: "x", show: "the delve family" }) === "the delve family");
}

{
  const forms = expandSource("delv(?:e|es|ed|ing)");
  const shown = flaggedCell({ phrase: "delv(?:e|es|ed|ing)", fix: "look at" });
  yes("a group alternation expands to a readable list", shown === "`delve`, `delves`, `delved`, `delving`", shown);
  yes("expandSource returns the literal forms", JSON.stringify(forms) === JSON.stringify(["delve", "delves", "delved", "delving"]));
  yes("a top-level alternation expands too", flaggedCell({ phrase: "myriad|plethora", fix: "many" }) === "`myriad`, `plethora`");
  yes("an optional group drops to the bare form", flaggedCell({ phrase: "embark(?:s|ed)?", fix: "start" }) === "`embark`, `embarks`, `embarked`");
}

{
  const shown = flaggedCell({ regex: "\\bparadigm\\b(?! shift)", fix: "model" });
  yes("a regex with no simple expansion prints in backticks", shown === "`\\bparadigm\\b(?! shift)`", shown);
  const piped = flaggedCell({ regex: "a|b\\b", fix: "x" });
  yes("a pipe inside a cell is escaped", piped === "`a\\|b\\b`", piped);
  const opener = flaggedCell({ opening: "ultimately", fix: "cut" });
  yes("an opening pattern is marked sentence-initial", opener === "`ultimately` (sentence-initial)", opener);
}

console.log("\ndocs (validate-packs.mjs)");

{
  const res = node(VALIDATOR, []);
  yes("the validator exits 0 on the built-in packs", res.status === 0, res.stdout);
  yes("the validator prints a count", /^ok: \d+ packs, \d+ patterns$/m.test(res.stdout), res.stdout);
}

function packFile(dir, id, body) {
  const path = join(dir, `${id}.json`);
  writeFileSync(path, JSON.stringify({ id, feature: "aiWriting", category: { id, label: id }, presets: ["all"], ...body }));
  return path;
}

{
  const dir = tmp("docs-bad");
  const path = packFile(dir, "broken-regex", { patterns: [{ regex: "(unclosed", fix: "x" }] });
  const res = node(VALIDATOR, [path]);
  yes("a bad regex exits 1", res.status === 1);
  yes("a bad regex is reported with its path", res.stdout.startsWith(`${path}: `), res.stdout);
  yes("a bad regex says it does not compile", res.stdout.includes("does not compile"), res.stdout);
}

{
  const dir = tmp("docs-nofix");
  const path = packFile(dir, "no-fix", { patterns: [{ phrase: "widget" }] });
  const res = node(VALIDATOR, [path]);
  yes("a pattern without a fix exits 1", res.status === 1);
  yes("a pattern without a fix is named", res.stdout.includes("needs a fix"), res.stdout);
}

{
  const dir = tmp("docs-dup");
  const one = join(dir, "a");
  const two = join(dir, "b");
  mkdirSync(one);
  mkdirSync(two);
  packFile(one, "twice-over", { patterns: [{ phrase: "widget", fix: "part" }] });
  packFile(two, "twice-over", { patterns: [{ phrase: "gadget", fix: "part" }] });
  const res = node(VALIDATOR, [one, two]);
  yes("a duplicate id exits 1", res.status === 1);
  yes("a duplicate id is reported", res.stdout.includes("duplicate id twice-over"), res.stdout);
}

{
  const dir = tmp("docs-preset");
  const path = packFile(dir, "odd-preset", { presets: ["nope"], patterns: [{ phrase: "widget", fix: "part" }] });
  const res = node(VALIDATOR, [path]);
  yes("an unknown preset exits 1", res.status === 1);
  yes("an unknown preset is named", res.stdout.includes("unknown preset nope"), res.stdout);
}

{
  const dir = tmp("docs-good");
  const path = packFile(dir, "extra-pack", { scope: ["files"], patterns: [{ phrase: "widget", fix: "part" }] });
  const res = node(VALIDATOR, [path]);
  yes("a sound extra pack exits 0", res.status === 0, res.stdout);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
