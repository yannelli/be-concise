import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, ok, bad } from "./lib.mjs";
import { COMMAND, expandSource, partName, render } from "../scripts/render-patterns.mjs";

const VALIDATOR = join(ROOT, "scripts", "validate-packs.mjs");
const RENDERER = join(ROOT, "scripts", "render-patterns.mjs");
const BUILTIN = join(ROOT, "hooks", "lib", "patterns");
const dirs = [];
const show = (value) => JSON.stringify(value);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual).slice(0, 600)));
const node = (args, options = {}) => spawnSync(process.execPath, args, { encoding: "utf8", ...options });

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "concise-cov-scripts-"));
  dirs.push(dir);
  return dir;
}

function packJson(dir, id, body) {
  writeFileSync(join(dir, `${id}.json`), show({ id, feature: "aiWriting", category: { id, label: id }, presets: ["all"], ...body }));
}

/** Writes a preload that patches node:fs before the script loads, to stand in for bad files on disk. */
function preload(dir, body) {
  const path = join(dir, "preload.mjs");
  writeFileSync(path, ["import fs from \"node:fs\";", "import { syncBuiltinESMExports } from \"node:module\";", ...body, "syncBuiltinESMExports();"].join("\n"));
  return pathToFileURL(path).href;
}

console.log("\ncoverage: validate-packs");

{
  const cwd = tempDir();
  const packs = join(cwd, "packs");
  const wide = join(packs, "～");
  const emoji = join(packs, "\u{1F600}");
  mkdirSync(wide, { recursive: true });
  mkdirSync(emoji);
  packJson(wide, "zz-wide", { notes: 5, patterns: [{ phrase: "zorblat", fix: "x" }] });
  packJson(emoji, "zz-emoji", { source: 5, patterns: [{ phrase: "quixal", fix: "x" }] });
  packJson(packs, "zz-show", { patterns: [{ phrase: "frobnik", fix: "x", show: 5 }] });
  writeFileSync(join(packs, "zz-broken.json"), "{ nope");
  writeFileSync(join(packs, "zz-detect.mjs"), "export default { id: \"zz-detect\", feature: \"aiWriting\", category: \"zz-detect\", presets: [\"all\"], detect: () => [] };\n");
  writeFileSync(join(packs, "zz-invalid.json"), show({ id: "zz-invalid", feature: "nope" }));
  const res = node([VALIDATOR, "packs", join(cwd, "missing.json")], { cwd });
  const lines = res.stdout.trim().split("\n");
  const at = (text) => lines.findIndex((line) => line.includes(text));
  check("problems in extra packs exit 1", res.status === 1, res);
  check("a relative directory argument is walked through subdirectories", at("zz-emoji.json: source must be a string") >= 0 && at("zz-wide.json: notes must be a string") >= 0, lines);
  check("subdirectories are walked in UTF-16 order", at("zz-emoji.json") < at("zz-wide.json"), lines);
  check("a pattern show that is not a string is reported", at("zz-show.json: pattern 0 show must be a string") >= 0, lines);
  check("an unreadable pack file is reported", at("zz-broken.json: ") >= 0, lines);
  check("a pack that fails validation is reported", at("zz-invalid.json: bad feature \"nope\"") >= 0, lines);
  check("a missing argument is reported", lines.includes(`${join(cwd, "missing.json")}: no such file or directory`), lines);
  check("an .mjs pack with only detect passes", at("zz-detect") === -1, lines);
}

{
  const dir = tempDir();
  const url = preload(dir, [
    "const real = fs.readFileSync;",
    "fs.readFileSync = (path, ...rest) => { if (String(path).endsWith(\"presets.json\")) throw new Error(\"EACCES\"); return real(path, ...rest); };",
  ]);
  const res = node(["--import", url, VALIDATOR]);
  check("an unreadable presets file is reported as no presets", res.status === 1 && res.stdout.includes(`${join(BUILTIN, "presets.json")}: no presets defined`), res);
}

{
  const dir = tempDir();
  const fakes = {
    "zz-fake-broken.json": "{ nope",
    "zz-fake-no-presets.json": show({ id: "zz-fake-no-presets", feature: "aiWriting", category: { id: "zz-fake", label: "fake" }, patterns: [{ phrase: "zorblat", fix: "x" }] }),
    "zz-fake-twin.json": show({ id: "zz-fake-twin", feature: "aiWriting", category: { id: "zz-fake", label: "fake" }, presets: ["all"], patterns: [{ phrase: "zorblat", fix: "y" }] }),
  };
  const url = preload(dir, [
    `const BUILTIN = ${show(BUILTIN)};`,
    `const FAKES = ${show(fakes)};`,
    "const realDir = fs.readdirSync;",
    "const realRead = fs.readFileSync;",
    "const fake = (name) => ({ name, isDirectory: () => false, isFile: () => true });",
    "fs.readdirSync = (dir, options) => { const out = realDir(dir, options); return String(dir) === BUILTIN ? [...out, ...Object.keys(FAKES).map(fake)] : out; };",
    "fs.readFileSync = (path, ...rest) => { const name = String(path).slice(BUILTIN.length + 1); return name in FAKES ? FAKES[name] : realRead(path, ...rest); };",
  ]);
  const res = node(["--import", url, VALIDATOR]);
  const lines = res.stdout.trim().split("\n");
  check("a built-in pack that fails to load is reported", res.status === 1 && lines.some((line) => line.startsWith(`${join(BUILTIN, "zz-fake-broken.json")}: `)), lines);
  check("a built-in aiWriting pack without presets is reported", lines.includes(`${join(BUILTIN, "zz-fake-no-presets.json")}: a built-in aiWriting pack must declare presets`), lines);
  check("a pattern shared by two built-in packs is reported", lines.some((line) => line.startsWith(join(BUILTIN, "zz-fake-twin.json")) && line.includes("is also in zz-fake-no-presets")), lines);
}

console.log("\ncoverage: render-patterns");

{
  check("an escaped character inside a group has no literal expansion", expandSource("(?:a\\.b)") === null, expandSource("(?:a\\.b)"));
  check("an unclosed group has no literal expansion", expandSource("(?:abc") === null, expandSource("(?:abc"));
  check("a capturing group has no literal expansion", expandSource("(abc)") === null, expandSource("(abc)"));
  const packs = [
    { builtin: true, feature: "aiWriting", id: "zz-det", categoryId: "zz", category: { id: "zz", label: "ZZ" }, patterns: [], detect: () => [], options: {}, source: "A book." },
    { builtin: true, feature: "aiWriting", id: "zz-pat", categoryId: "zz", category: { id: "zz", label: "ZZ" }, patterns: [{ phrase: "zorblat", fix: "plain" }], presets: ["ryan"] },
    { builtin: false, feature: "aiWriting", id: "skip", categoryId: "skip", category: { id: "skip", label: "Skip" }, patterns: [] },
  ];
  const files = render(packs);
  const text = files.get(partName(0));
  check("one section renders as a single untitled part", files.size === 1 && text.includes("\n# AI speak patterns\n"), [...files.keys()]);
  check("a detector with no description or options gets the fallback row", text.includes("| the zz-det detector | reported with the measured value |"), text);
  check("presets gain all and the source keeps its period", text.includes("Presets: `ryan`, `all`. Source: A book.\n"), text);
}

{
  const missing = join(tempDir(), "absent");
  const res = node([RENDERER, "--check", "--out", missing]);
  check("check against a missing directory lists every file and exits 1", res.status === 1 && res.stdout.includes(join(missing, partName(0))) && res.stdout.trim().endsWith(COMMAND), res);
  check("check does not create the directory", !existsSync(missing), missing);
}

{
  const out = tempDir();
  const stale = join(out, "ai-speak-patterns-99.md");
  node([RENDERER, "--out", out]);
  writeFileSync(stale, "old\n");
  const checked = node([RENDERER, "--check", "--out", out]);
  check("check lists a stale part file", checked.status === 1 && checked.stdout.split("\n")[0] === stale, checked);
  const written = node([RENDERER, "--out", out]);
  check("writing removes the stale part file", written.status === 0 && !existsSync(stale) && readdirSync(out).every((name) => name !== "ai-speak-patterns-99.md"), readdirSync(out));
  check("the kept files still match the render", node([RENDERER, "--check", "--out", out]).status === 0 && readFileSync(join(out, partName(0)), "utf8").length > 0, out);
}

{
  const imports = [VALIDATOR, RENDERER].map((path) => `await import(${show(pathToFileURL(path).href)});`).join(" ");
  const res = node(["--input-type=module", "-e", `${imports} console.log("imported");`]);
  check("importing the scripts without a script path runs neither main", res.status === 0 && res.stdout === "imported\n", res);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
