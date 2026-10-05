import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { ok, bad } from "./lib.mjs";
import { defaultConfig } from "../hooks/lib/config.mjs";
import { KINDS, readSamples, tune } from "../tools/tune.mjs";

const EM = "\u2014";
const EN = "\u2013";
const dirs = [];
const show = (value) => JSON.stringify(value);

function temp() {
  const dir = mkdtempSync(join(tmpdir(), "concise-tune-"));
  dirs.push(dir);
  return dir;
}

function eq(name, actual, expected) {
  if (show(actual) === show(expected)) return ok(name);
  bad(name, `expected ${show(expected)}, got ${show(actual)}`);
}

function has(name, list, value) {
  if (Array.isArray(list) && list.some((item) => show(item) === show(value))) return ok(name);
  bad(name, `expected ${show(value)} in ${show(list)}`);
}

function lacks(name, list, value) {
  if (!Array.isArray(list) || !list.includes(value)) return ok(name);
  bad(name, `expected no ${show(value)} in ${show(list)}`);
}

// prepareStyle loads user packs from these locations, so each case runs with them unset.
const USER_ENV = ["HOME", "USERPROFILE", "XDG_CONFIG_HOME"];

async function test(name, body) {
  const saved = USER_ENV.filter((key) => key in process.env).map((key) => [key, process.env[key]]);
  for (const key of USER_ENV) delete process.env[key];
  try {
    await body();
  } catch (err) {
    bad(name, err.stack || err.message);
  } finally {
    for (const [key, value] of saved) process.env[key] = value;
  }
}

function configWith(edit = () => {}) {
  const config = defaultConfig();
  edit(config);
  return config;
}

const sample = (name, text) => ({ name, text, path: name });
const run = (samples, options = {}) => tune({ samples, cwd: temp(), config: configWith(), ...options });
const aiOf = (result) => (result.delta.features || {}).aiWriting || {};
const dashOf = (result) => (result.delta.features || {}).emDash;
const evidenceFor = (result, key, value) => result.evidence.find((e) => e.key === key && e.value === value);

const SUBJECTS = ["The parser", "Our build", "This script", "The cache", "A worker", "The server", "My test", "The queue", "That job"];
const VERBS = ["reads", "writes", "checks", "sends", "loads", "keeps", "drops"];
const OBJECTS = ["the file", "each row", "a token", "the log", "one record", "the index", "two flags", "a batch", "the list", "old data", "the plan"];

function prose(count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`${SUBJECTS[i % 9]} ${VERBS[i % 7]} ${OBJECTS[i % 11]}${i % 3 === 0 ? " before the nightly run" : ""}.`);
    if (i % 5 === 4) out.push("\n\n");
  }
  return out.join(" ");
}

const PASSIVE = [
  "The cache was cleared by the job at noon.",
  "Each request is logged in the access file.",
  "The schema was changed last week after review.",
  "Old rows were removed from the table on Monday.",
  "A new index was added to speed up the lookup.",
  "The build is checked on every push to main.",
  "Two flags were renamed to match the docs.",
  "The token is stored in the session store.",
  "Errors are reported to the team channel.",
  "The config file is read once at start.",
];
const ACTIVE = [
  "We ship the patch on Friday morning.",
  "Ana runs the full suite before each merge.",
  "The worker pulls ten jobs from the queue.",
  "Our script copies the logs to cold storage.",
  "Tom writes the release notes by hand.",
  "The proxy drops idle sockets after a minute.",
  "Lee keeps a short list of open bugs.",
  "The bot posts a summary in the channel.",
  "We read the metrics every Monday.",
  "The cron task prunes old branches at night.",
];

console.log("\ntune: AI writing categories");

await test("vocabulary across samples", async () => {
  const result = await run([sample("a.md", "We delve into the parser today."), sample("b.md", "The tapestry of tests grew.")]);
  has("a category that fires in 2 samples goes to disablePatterns", aiOf(result).disablePatterns, "vocabulary");
  const proof = evidenceFor(result, "features.aiWriting.disablePatterns", "vocabulary");
  eq("the disable evidence quotes both samples", proof && proof.examples, ['"delve" (a.md:1)', '"tapestry" (b.md:1)']);
  eq("the disable evidence states the counts", proof && proof.reason, "vocabulary fired 2 times in 2 of 2 samples over 11 words.");
});

await test("one repeated phrase", async () => {
  const text = "It is worth noting that the cache holds. It is worth noting that the queue drains.";
  const result = await run([sample("a.md", text), sample("b.md", "The parser reads the file.")]);
  eq("one phrase repeated in one sample goes to allow", aiOf(result).allow, ["it is worth noting"]);
  lacks("the category stays on", aiOf(result).disablePatterns, "transitions");
});

await test("an allowed phrase", async () => {
  const config = configWith((c) => (c.features.aiWriting.allow = ["delve"]));
  const result = await run([sample("a.md", "We delve into it."), sample("b.md", "We delve again.")], { config });
  eq("a phrase the config allows proposes nothing", aiOf(result), {});
});

await test("one hit in a long sample", async () => {
  const result = await run([sample("a.md", `${prose(200)}\n\nWe delve into the parser.`)]);
  has("one hit over 1000 words is kept", result.kept.map((k) => k.category), "vocabulary");
  lacks("a kept category stays out of disablePatterns", aiOf(result).disablePatterns, "vocabulary");
});

await test("already disabled", async () => {
  const config = configWith((c) => (c.features.aiWriting.disablePatterns = ["vocabulary"]));
  const result = await run([sample("a.md", "We delve in."), sample("b.md", "A tapestry.")], { config });
  eq("a category the config disables proposes nothing", aiOf(result).disablePatterns, undefined);
});

await test("preset and enable", async () => {
  const result = await run([sample("a.md", prose(80))], { preset: "ryan" });
  eq("a different preset lands in the delta", aiOf(result).preset, "ryan");
  eq("300 or more words turn aiWriting on when it is off", aiOf(result).enabled, true);
  const proof = evidenceFor(result, "features.aiWriting.enabled", true);
  if (proof && /pass \d+ of \d+ active categories/.test(proof.reason)) ok("the enable evidence counts clean categories");
  else bad("the enable evidence counts clean categories", show(proof));
});

console.log("\ntune: statistical packs");

await test("short samples", async () => {
  const config = configWith((c) => (c.features.aiWriting.preset = "ryan"));
  const result = await run([sample("a.md", "The parser reads the file.")], { config });
  has("passive-voice is listed as insufficient", result.insufficient, { pack: "passive-voice", words: 5, minWords: 150 });
  has("sentence-variation is listed as insufficient", result.insufficient, { pack: "sentence-variation", words: 5, minWords: 160 });
  eq("short samples change no pack option", aiOf(result).options, undefined);
});

await test("passive voice threshold", async () => {
  const config = configWith((c) => (c.features.aiWriting.preset = "ryan"));
  const text = PASSIVE.map((line, i) => `${line} ${ACTIVE[i]}`).join("\n\n");
  const result = await run([sample("p.md", text)], { config });
  eq("maxRatio moves just above the observed 50%", ((aiOf(result).options || {})["passive-voice"] || {}).maxRatio, 0.5);
  const proof = evidenceFor(result, "features.aiWriting.options.passive-voice.maxRatio", 0.5);
  if (proof && proof.reason.includes("passive voice 50% of sentences")) ok("the option evidence states the observed value");
  else bad("the option evidence states the observed value", show(proof));
  lacks("a tuned pack stays out of disablePatterns", aiOf(result).disablePatterns, "passive-voice");
});

console.log("\ntune: dashes");

await test("em dashes", async () => {
  const samples = [sample("a.md", `The parser ${EM} the old one ${EM} works.`), sample("b.md", "The queue drains.")];
  const on = configWith((c) => (c.features.emDash.enabled = true));
  eq("em dashes turn emDash off when it is on", dashOf(await run(samples, { config: on })), { enabled: false });
  eq("em dashes with emDash already off add no key", dashOf(await run(samples)), undefined);
});

await test("clean long samples", async () => {
  const result = await run([sample("a.md", prose(120)), sample("b.md", prose(100))]);
  if (result.words >= 1000) ok("the clean fixture holds 1000 or more words");
  else bad("the clean fixture holds 1000 or more words", result.words);
  eq("no dashes over 1000 words turn emDash on", dashOf(result), { enabled: true });
  eq("fewer than 1000 words leave emDash alone", dashOf(await run([sample("a.md", prose(60))])), undefined);
});

await test("en dashes only", async () => {
  const on = configWith((c) => (c.features.emDash.enabled = true));
  const result = await run([sample("a.md", `Pages 3${EN}9 hold the table.`)], { config: on });
  eq("en dashes without em dashes turn enDash off", dashOf(result), { enDash: false });
});

console.log("\ntune: limits");

const paragraph = (n) => Array.from({ length: n }, (_, i) => `Step ${i + 1} runs.`).join(" ");

await test("gh sentences", async () => {
  const samples = [sample("1", paragraph(5)), sample("2", paragraph(4)), sample("3", `${paragraph(2)}\n\n- one item`)];
  const result = await run(samples, { kind: "gh" });
  eq("gh raises maxPrBodySentences to the p90", result.delta.maxPrBodySentences, 5);
  eq("gh leaves maxPrBodyParagraphs when the p90 fits", result.delta.maxPrBodyParagraphs, undefined);
  const high = configWith((c) => (c.maxPrBodySentences = 10));
  eq("gh does not lower maxPrBodySentences", (await run(samples, { kind: "gh", config: high })).delta.maxPrBodySentences, undefined);
});

await test("gh paragraphs", async () => {
  const body = [paragraph(1), paragraph(1), paragraph(1)].join("\n\n");
  const result = await run([sample("1", body), sample("2", body)], { kind: "gh" });
  eq("gh raises maxPrBodyParagraphs to the p90", result.delta.maxPrBodyParagraphs, 3);
});

await test("comment runs", async () => {
  const code = ["// one", "// two", "// three", "// four", "const x = 1;", "// solo", "const y = 2;"].join("\n");
  const result = await run([sample("a.mjs", code), sample("b.mjs", code)], { kind: "comments" });
  eq("comments raises maxCommentLines to the p90", result.delta.maxCommentLines, 4);
  const high = configWith((c) => (c.maxCommentLines = 6));
  eq("comments does not lower maxCommentLines", (await run([sample("a.mjs", code)], { kind: "comments", config: high })).delta, {});
});

console.log("\ntune: samples and side effects");

function write(dir, name, text) {
  mkdirSync(dirname(join(dir, name)), { recursive: true });
  writeFileSync(join(dir, name), text);
}

function snapshot(dir) {
  return readdirSync(dir, { recursive: true }).sort().map((name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    return [name, stat.mtimeMs, stat.isFile() ? readFileSync(path, "utf8") : null];
  });
}

const tree = () => {
  const dir = temp();
  write(dir, "a.md", "We delve into the parser.");
  write(dir, "b.txt", "The tapestry of tests.");
  write(dir, "c.mjs", ["// a note", "export const x = 1;"].join("\n"));
  write(dir, "data.json", "{}");
  write(dir, "sub/e.md", "The queue drains.");
  write(dir, "sub/f.py", "# note\nx = 1\n");
  write(dir, "node_modules/g.md", "skipped");
  write(dir, ".hidden/h.md", "skipped");
  write(dir, "notes.log", "The log holds a line.");
  return dir;
};

await test("readSamples", async () => {
  const dir = tree();
  const names = (list) => list.map((s) => relative(dir, s.path));
  eq("docs walks prose files only", names(readSamples([dir], "docs")), ["a.md", "b.txt", join("sub", "e.md")]);
  eq("comments walks code files only", names(readSamples([dir], "comments")), ["c.mjs", join("sub", "f.py")]);
  eq("a named file is read whatever its extension", names(readSamples([join(dir, "notes.log")], "docs")), ["notes.log"]);
  const [first] = readSamples([dir], "docs");
  eq("a sample carries its text", first.text, "We delve into the parser.");
});

await test("no writes", async () => {
  const dir = tree();
  const before = snapshot(dir);
  const config = configWith((c) => (c.features.emDash.enabled = true));
  const result = await tune({ samples: readSamples([dir], "docs"), kind: "docs", cwd: dir, config });
  eq("tune leaves the sample directory unchanged", snapshot(dir), before);
  has("tune still proposed a change", aiOf(result).disablePatterns, "vocabulary");
});

await test("determinism", async () => {
  const samples = [sample("a.md", `We delve ${EM} into it.`), sample("b.md", prose(70))];
  const options = { cwd: temp(), config: configWith((c) => (c.features.emDash.enabled = true)), preset: "ryan" };
  const one = await tune({ samples, ...options });
  const two = await tune({ samples, ...options });
  eq("two runs give the same result", show(one), show(two));
  eq("the result counts samples and words", [one.kind, one.samples, one.words > 0], ["docs", 2, true]);
});

await test("bad kind", async () => {
  eq("KINDS lists every sample kind", KINDS, ["docs", "reply", "commit", "gh", "comments"]);
  const error = await tune({ samples: [], kind: "nope", cwd: temp(), config: configWith() }).catch((err) => err);
  if (error instanceof Error && error.message.includes("nope")) ok("an unknown kind is rejected");
  else bad("an unknown kind is rejected", show(error));
});

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
