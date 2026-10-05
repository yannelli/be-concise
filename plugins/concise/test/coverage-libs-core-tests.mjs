import fs, { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok, bad } from "./lib.mjs";
import { compileEntry, dictionaryActive, dictionaryEntries, entryProblem, mergeEntries, scanDictionary } from "../hooks/lib/dictionary.mjs";
import { compilePattern, loadPacks, resolveActive, validatePack } from "../hooks/lib/packs.mjs";
import { resolveCategories, scanAiWriting } from "../hooks/lib/ai-patterns.mjs";
import { extractBody, isVerbose } from "../hooks/lib/pr-body.mjs";
import { blankTables, startOf } from "../hooks/lib/stats-shared.mjs";
import { makeStats } from "../hooks/lib/text-stats.mjs";
import { applyLayer, mergePatternLists } from "../hooks/lib/config-layers.mjs";
import { extractPatch, parseApplyPatch } from "../hooks/lib/apply-patch.mjs";
import { loadConfig, projectConfigPath } from "../hooks/lib/config.mjs";
import { scanComments } from "../hooks/lib/comment-scan.mjs";
import { extOf } from "../hooks/lib/prose.mjs";

const show = (value) => JSON.stringify(value);
const eq = (name, actual, expected) => (show(actual) === show(expected) ? ok(name) : bad(name, `expected ${show(expected)}, got ${show(actual)}`));
const truthy = (name, value, detail) => (value ? ok(name) : bad(name, detail));

const dirs = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "concise-cov-libs-"));
  dirs.push(dir);
  return dir;
};
const writeJson = (path, value) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
};

/** Swaps fs.readFileSync for paths ending in `suffix`, and syncs the ESM named exports both ways. */
async function withFakeRead(suffix, fake, fn) {
  const real = fs.readFileSync;
  fs.readFileSync = (path, ...rest) => (String(path).endsWith(suffix) ? fake(path) : real(path, ...rest));
  syncBuiltinESMExports();
  try {
    return await fn();
  } finally {
    fs.readFileSync = real;
    syncBuiltinESMExports();
  }
}

console.log("\ncoverage-libs: dictionary");

const valid = { id: "d", match: "exact", value: "foo", fix: "bar" };
eq("entryProblem rejects a non-object", [entryProblem(null), entryProblem("x")], ["entry is not an object", "entry is not an object"]);
eq("entryProblem shows a missing id as null", entryProblem({ ...valid, id: undefined }), "bad id null");
eq("entryProblem rejects a non-boolean enabled", entryProblem({ ...valid, enabled: "yes" }), "enabled must be a boolean");
eq("entryProblem rejects a non-boolean caseSensitive", entryProblem({ ...valid, caseSensitive: "yes" }), "caseSensitive must be a boolean");
eq("entryProblem rejects non-string regex flags", entryProblem({ ...valid, match: "regex", flags: 5 }), "flags applies to a regex entry only");
eq("entryProblem accepts string regex flags", entryProblem({ ...valid, match: "regex", flags: "i" }), null);

const sensitive = compileEntry({ id: "r", fix: "f", match: "regex", value: "Foo", caseSensitive: true });
eq("a caseSensitive regex entry has no i flag", sensitive.re.flags, "dg");
eq("a caseSensitive regex entry keeps case", scanDictionary("foo Foo", [sensitive]).map((hit) => hit.match), ["Foo"]);

eq("dictionaryActive is false without config or features", [dictionaryActive(undefined), dictionaryActive({})], [false, false]);
eq("dictionaryEntries is empty when the feature is off", dictionaryEntries({ features: {} }), { entries: [], problems: [] });

const mixed = dictionaryEntries({ features: { dictionary: { enabled: true, entries: ["raw", { id: 7 }, valid] } } });
eq("dictionaryEntries names bad entries by index", mixed.problems, [
  { id: "#0", reason: "entry is not an object" },
  { id: "#1", reason: "bad id 7" },
]);
eq("dictionaryEntries keeps the valid entry", mixed.entries.map((entry) => entry.id), ["d"]);

const spaces = compileEntry({ id: "s", fix: "f", match: "regex", value: "\\s+|x" });
eq("scanDictionary skips a whitespace-only hit", scanDictionary("a x b", [spaces]).map((hit) => hit.match), ["x"]);

eq("mergeEntries starts empty without a base array", mergeEntries(undefined, [valid]), [valid]);
eq("mergeEntries keeps the base without a layer array", mergeEntries([valid], null), [valid]);
eq("mergeEntries appends non-object layer entries", mergeEntries([valid], ["x", { ...valid, fix: "baz" }]), [{ ...valid, fix: "baz" }, "x"]);

console.log("\ncoverage-libs: packs");

const pack = { id: "p", feature: "aiWriting", category: "c", patterns: [{ phrase: "foo", fix: "bar" }] };
const cases = [
  ["a non-object pattern", { ...pack, patterns: [null] }, "pattern 0 is not an object"],
  ["a bad category string", { ...pack, category: "Bad Id" }, "bad category id Bad Id"],
  ["a scalar category", { ...pack, category: 5 }, "category must be a string or an object"],
  ["a category without an id", { ...pack, category: { label: "x" } }, "category needs an id"],
  ["a missing id", { ...pack, id: undefined }, "bad id null"],
  ["a non-array scope", { ...pack, scope: "files" }, "scope must be an array"],
  ["non-array presets", { ...pack, presets: "all" }, "presets must be an array"],
  ["non-array tags", { ...pack, tags: "x" }, "tags must be an array"],
  ["a non-function detect", { ...pack, detect: "x" }, "detect must be a function"],
  ["non-array patterns", { ...pack, patterns: "x" }, "patterns must be an array"],
];
for (const [label, raw, reason] of cases) eq(`validatePack rejects ${label}`, validatePack(raw), { ok: false, reason });
eq("validatePack accepts array tags", validatePack({ ...pack, tags: ["x"] }), { ok: true });

{
  const dir = tmp();
  const patterns = join(dir, ".claude", "concise", "patterns");
  for (const name of ["m", "b", "x", "a", "q", "f", "\uFF01", "\u{1F600}"]) writeJson(join(patterns, "bad", `${name}.json`), "{");
  writeJson(join(patterns, "one", "dup.json"), { ...pack, id: "dup" });
  writeJson(join(patterns, "two", "dup.json"), { ...pack, id: "dup", category: "other" });
  writeJson(join(patterns, "tagged.json"), { ...pack, id: "tagged", tags: ["custom"] });
  writeFileSync(join(dir, "notes.txt"), "not a pack");
  const config = { features: { aiWriting: { packs: ["missing-dir", "notes.txt"] } } };
  const loaded = await loadPacks({ cwd: dir, config });
  const reasons = loaded.problems.map((p) => p.reason);
  const badPaths = loaded.problems.filter((p) => p.path.includes(`${join("patterns", "bad")}`)).map((p) => p.path.split("/").pop());
  const order = ["a.json", "b.json", "f.json", "m.json", "q.json", "x.json", "\u{1F600}.json", "\uFF01.json"];
  eq("loadPacks reads a directory in UTF-16 name order", badPaths, order);
  truthy("loadPacks reports a duplicate id in one source", reasons.includes("duplicate id dup in this source"), show(reasons));
  eq("loadPacks keeps the first duplicate", loaded.packs.find((p) => p.id === "dup").categoryId, "c");
  eq("loadPacks keeps a pack's own tags", loaded.packs.find((p) => p.id === "tagged").tags, ["custom"]);
  const plain = await loadPacks({ cwd: dir });
  eq("loadPacks skips missing and non-pack paths", loaded.packs.length, plain.packs.length);
  eq("loadPacks reads the presets file", Object.keys(plain.presets).includes("default"), true);

  const faulted = await withFakeRead("presets.json", () => {
    throw new Error("unreadable");
  }, () => loadPacks({ cwd: dir }));
  eq("loadPacks falls back to no presets when the file is unreadable", faulted.presets, {});
}

{
  const here = (await loadPacks({})).packs.map((p) => p.id);
  const dot = (await loadPacks({ cwd: "." })).packs.map((p) => p.id);
  eq("loadPacks without cwd reads the current directory", here, dot);
}

eq("resolveActive with no presets allows nothing", resolveActive({ packs: [], presets: {} }).allow, []);

console.log("\ncoverage-libs: ai-patterns");

const aiPack = (id, extra = {}) => ({ id, categoryId: id, category: { id, label: id }, patterns: [], detect: null, options: {}, ...extra });
const resolved = resolveCategories({}, {});
eq("resolveCategories works without loaded packs", [[...resolved.ids], resolved.allow, resolved.packs], [[], [], []]);

const emptyMatch = aiPack("empty", { patterns: [compilePattern({ regex: "b*", fix: "f" })] });
eq("scanAiWriting steps past empty regex matches", scanAiWriting("abba", { packs: [emptyMatch] }).map((f) => f.match), ["bb"]);

const nullDetect = aiPack("none", { detect: () => null });
eq("scanAiWriting treats a null detect result as no findings", scanAiWriting("text", { packs: [nullDetect] }), []);

const pair = aiPack("pair", { detect: () => [{ index: 0, match: "one", tier: 2 }, { index: 4, match: "two", tier: 2 }] });
eq("scanAiWriting keeps clustered tier 2 detect findings with the default fix",
  scanAiWriting("one two", { packs: [pair] }).map((f) => [f.match, f.fix]), [["one", "rewrite"], ["two", "rewrite"]]);
const lone = aiPack("lone", { detect: () => [{ index: 0, match: "one", tier: 2 }] });
eq("scanAiWriting drops a lone tier 2 detect finding", scanAiWriting("one two", { packs: [lone] }), []);
eq("scanAiWriting returns nothing when no pack is in the categories",
  scanAiWriting("one two", { packs: [pair], categories: new Set(["other"]) }), []);

console.log("\ncoverage-libs: em-dash");

{
  const throwing = await withFakeRead("em-dash.json", () => {
    throw new Error("unreadable");
  }, () => import("../hooks/lib/em-dash.mjs?fault=throw"));
  eq("findDashes finds nothing when the pack file is unreadable", throwing.findDashes("a — b"), []);
  const bare = await withFakeRead("em-dash.json", () => "{}", () => import("../hooks/lib/em-dash.mjs?fault=bare"));
  eq("findDashes finds nothing when the pack has no patterns", bare.findDashes("a — b"), []);
}

console.log("\ncoverage-libs: pr-body, stats-shared, apply-patch, comment-scan, prose");

eq("extractBody returns null without a body", extractBody("gh pr create --title x"), null);
eq("isVerbose skips fenced code", isVerbose("```\nOne. Two. Three. Four.\n```\nShort line.", { maxParagraphs: 5, maxSentences: 2 }), { verbose: false });
eq("blankTables blanks table rows in place", blankTables("| a |\ntext"), "     \ntext");
eq("startOf is 0 without sentences", startOf(makeStats("")), 0);
eq("extractPatch returns null for no command", extractPatch(undefined), null);
eq("parseApplyPatch returns no files for no patch", parseApplyPatch(undefined), []);
eq("scanComments finds nothing for a file without an extension", scanComments("// note\n", "Makefile"), []);
eq("scanComments stops at an unclosed block comment", scanComments("/* open\nno close", "a.js"), []);
eq("extOf is empty for no path or no extension", [extOf(undefined), extOf("Makefile")], ["", ""]);

console.log("\ncoverage-libs: config");

{
  const layered = applyLayer({}, {});
  eq("applyLayer gives an empty ignore list without either side", layered.styleIgnoreGlobs, []);
  eq("applyLayer adds ignore globs to a missing base", applyLayer({}, { styleIgnoreGlobs: ["a"] }).styleIgnoreGlobs, ["a"]);
  eq("mergePatternLists handles empty layers", mergePatternLists({}, {}), { enable: [], disable: [] });
  const features = applyLayer({ features: { flag: true } }, { features: { flag: false, extra: { a: 1 } } }).features;
  eq("applyLayer replaces scalar features and adds new feature objects", [features.flag, features.extra], [false, { a: 1 }]);

  const env = { BEC_LOG_MAX_FILES: "3", BEC_ALWAYS_ENABLE_PATTERNS: "foo-bar" };
  const config = loadConfig(tmp(), env);
  eq("loadConfig applies BEC_LOG_MAX_FILES", config.log.maxFiles, 3);
  truthy("loadConfig applies BEC_ALWAYS_ENABLE_PATTERNS", config.features.aiWriting.enablePatterns.includes("foo-bar"), show(config.features.aiWriting));

  const arrayDir = tmp();
  writeJson(join(arrayDir, ".claude", "concise.json"), "[1, 2]");
  const arrayConfig = loadConfig(arrayDir, {});
  truthy("loadConfig reports a config file that is not an object",
    arrayConfig.problems.some((p) => p.reason === "file is not a JSON object"), show(arrayConfig.problems));

  const nullDir = withConfigDir({ softFail: true });
  eq("loadConfig accepts a null env", loadConfig(nullDir, null).softFail, true);
  eq("projectConfigPath without cwd reads the current directory", projectConfigPath(undefined, {}), projectConfigPath(".", {}));
}

function withConfigDir(config) {
  const dir = tmp();
  writeJson(join(dir, ".claude", "concise.json"), config);
  return dir;
}

dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
