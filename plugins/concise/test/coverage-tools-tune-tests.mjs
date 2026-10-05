import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok, bad } from "./lib.mjs";
import { defaultConfig } from "../hooks/lib/config.mjs";
import { readSamples, tune } from "../tools/tune.mjs";

const dirs = [];
const show = (value) => JSON.stringify(value);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual).slice(0, 400)));
const aiOf = (result) => (result.delta.features || {}).aiWriting || {};

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "concise-cov-tune-"));
  dirs.push(dir);
  return dir;
}

/** A project whose .claude/concise/patterns holds the given .mjs pack sources, keyed by pack id. */
function withPacks(packs) {
  const dir = tempDir();
  const patterns = join(dir, ".claude", "concise", "patterns");
  mkdirSync(patterns, { recursive: true });
  for (const [id, source] of Object.entries(packs)) writeFileSync(join(patterns, `${id}.mjs`), source);
  return dir;
}

function statPack(id, options, detectBody) {
  return [
    "export default {",
    `  id: ${show(id)}, feature: "aiWriting", category: { id: ${show(id)}, label: ${show(id)} },`,
    `  scope: ["files", "reply"], options: ${show(options)},`,
    `  detect(text, ctx) { ${detectBody} },`,
    "};",
  ].join("\n");
}

const HIT = "return [{ index: 0, match: \"measured\", fix: \"rewrite\" }];";
const PROSE = "The parser reads each line. It stores the tokens. The writer prints them back.";

console.log("\ncoverage: tune");

{
  check("readSamples with no paths returns no samples", show(readSamples()) === "[]", readSamples());
  const dir = tempDir();
  for (const name of ["b.md", "c.md", "a.md", "e.md", "d.md"]) writeFileSync(join(dir, name), `${name}\n`);
  const names = readSamples([dir]).map((sample) => sample.name.slice(dir.length + 1));
  check("a directory walk returns files sorted by name", show(names) === show(["a.md", "b.md", "c.md", "d.md", "e.md"]), names);
  const wide = tempDir();
  for (const name of ["\uFF5E.md", "\u{1F600}.md"]) writeFileSync(join(wide, name), "x\n");
  const order = readSamples([wide]).map((sample) => sample.name.slice(wide.length + 1));
  check("the walk orders names by UTF-16 code units", show(order) === show(["\u{1F600}.md", "\uFF5E.md"]), order);
}

{
  const cwd = tempDir();
  const bare = await tune({ samples: [{ name: "a.md", text: PROSE }], cwd, config: {} });
  check("a config with no features tunes from the defaults", bare.samples === 1 && bare.kind === "docs", bare);
  const loaded = await tune({ samples: [{ name: "a.md", text: PROSE }], cwd });
  check("tune loads the config from cwd when none is passed", loaded.samples === 1 && Array.isArray(loaded.evidence), loaded);
  const gh = await tune({ samples: [], kind: "gh", cwd, config: defaultConfig() });
  check("gh with no samples proposes no PR body limits", !("maxPrBodyParagraphs" in gh.delta) && gh.samples === 0, gh.delta);
  const config = { ...defaultConfig(), maxCommentLines: 1 };
  const comments = await tune({ samples: [{ name: "lib.js", text: "// one\n// two\n// three\nconst x = 1;\n" }], kind: "comments", cwd, config });
  check("a comments sample without a path is scanned by its name", comments.delta.maxCommentLines === 3, comments.delta);
}

{
  const cwd = withPacks({
    "sentence-variation": statPack("sentence-variation", { minWords: 1, minCv: 0.05 }, HIT),
    "readability-grade": statPack("readability-grade", { minWords: 1, maxGrade: 16 }, HIT),
    "passive-voice": statPack("passive-voice", { minWords: 1, maxRatio: 0.3 }, `if (ctx.options.maxRatio !== 0.3) throw new Error("boom"); ${HIT}`),
    "rare-words": statPack("rare-words", { minWords: 1, maxRatio: 0.25 }, `return ctx.options.maxRatio === 0.25 ? [{ index: 0, match: "rare", fix: "x" }] : null;`),
    "word-frequency": statPack("word-frequency", { minWords: 1, maxShare: 0.035 }, `return ctx.options === this.options ? [{ index: 0, match: "share", fix: "x" }] : [];`),
  });
  const result = await tune({ samples: [{ name: "a.md", text: PROSE }, { name: "b.md", text: PROSE }], cwd, config: defaultConfig(), preset: "all" });
  const disabled = aiOf(result).disablePatterns || [];
  const options = aiOf(result).options || {};
  check("a lower bound that would drop below zero disables the category", disabled.includes("sentence-variation"), aiOf(result));
  check("a threshold that never passes in 400 steps disables the category", disabled.includes("readability-grade"), aiOf(result));
  check("a detector that throws while tuning disables the category", disabled.includes("passive-voice"), aiOf(result));
  check("a detector returning null passes at the next step", options["rare-words"]?.maxRatio === 0.26, options);
  const evidence = result.evidence.find((item) => item.key === "features.aiWriting.options.word-frequency.maxShare");
  check("a detector that only fires in the scan still tunes from the first span", evidence?.value === 0.036 && evidence.reason.includes("worst at share"), result.evidence);
}

{
  const cwd = withPacks({ "aaa-stat": statPack("aaa-stat", { minWords: 100000 }, HIT) });
  const result = await tune({ samples: [{ name: "a.md", text: PROSE }], cwd, config: defaultConfig(), preset: "all" });
  const packs = result.insufficient.map((row) => row.pack);
  check("a category whose statistical pack lacks words is left alone", !(aiOf(result).disablePatterns || []).includes("aaa-stat"), aiOf(result));
  check("insufficient packs are sorted by id", packs[0] === "aaa-stat" && show(packs) === show([...packs].sort()) && packs.length > 2, packs);
}

{
  const phrasePack = (id) => `export default { id: ${show(id)}, feature: "aiWriting", category: { id: ${show(id)}, label: ${show(id)} }, patterns: [{ phrase: "zorblat", fix: "plain" }] };`;
  const cwd = withPacks({ "zz-one": phrasePack("zz-one"), "zz-two": phrasePack("zz-two") });
  const text = "The zorblat ran. A zorblat stopped.";
  const result = await tune({ samples: [{ name: "a.md", text }], cwd, config: defaultConfig() });
  const allow = aiOf(result).allow || [];
  const notes = result.evidence.filter((item) => item.key === "features.aiWriting.allow");
  check("the same phrase from two categories is allowed once", show(allow) === show(["zorblat"]) && notes.length === 1, result.evidence);
}

{
  const pack = (id, phrase) => `export default { id: ${show(id)}, feature: "aiWriting", category: { id: ${show(id)}, label: ${show(id)} }, patterns: [{ phrase: ${show(phrase)}, fix: "plain" }] };`;
  const cwd = withPacks({ "zz-alpha": pack("zz-alpha", "zorblat"), "zz-beta": pack("zz-beta", "quixal") });
  const filler = Array.from({ length: 120 }, () => "The parser reads each line and stores tokens.").join(" ");
  const result = await tune({ samples: [{ name: "a.md", text: `A zorblat ran. ${filler} A quixal stopped.` }], cwd, config: defaultConfig() });
  const kept = result.kept.map((item) => item.category).filter((id) => id.startsWith("zz-"));
  check("rare single hits are kept and listed by category", show(kept) === show(["zz-alpha", "zz-beta"]) && /left on/.test(result.kept[0].reason), result.kept);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
