#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ok, bad, summary } from "./lib.mjs";
import { PROSE_EXTENSIONS, stripCode, proseSpans, gitCommitMessages } from "../hooks/lib/prose.mjs";
import { findDashes } from "../hooks/lib/em-dash.mjs";
import { resolveCategories, scanAiWriting } from "../hooks/lib/ai-patterns.mjs";
import { loadPacks } from "../hooks/lib/packs.mjs";

const loaded = await loadPacks({ cwd: "/nonexistent-concise-cwd" });
const CATEGORIES = loaded.categories;
const PRESETS = loaded.presets;
const AI_PACKS = loaded.packs.filter((pack) => pack.feature === "aiWriting");
const scan = (text, options = {}) => scanAiWriting(text, { packs: AI_PACKS, ...options });

const show = (v) => JSON.stringify(v);

function eq(name, actual, expected) {
  if (show(actual) === show(expected)) return ok(name);
  bad(name, `expected ${show(expected)}, got ${show(actual)}`);
}

function yes(name, condition, detail) {
  if (condition) return ok(name);
  bad(name, detail || "expected true");
}

const ids = (text, options) => [...new Set(scan(text, options).map((h) => h.category))];
const matchesOnly = (text, id) => scan(text, { categories: [id] }).map((h) => h.match);

console.log("prose.mjs stripCode");

const MD = [
  "# Title",
  "",
  "Prose with `delve` inline and https://example.com/delve linked.",
  "",
  "```js",
  "const delve = 1;",
  "```",
  "",
  "<!-- delve",
  "still a comment -->",
  "Plain delve stays.",
  "",
  "~~~",
  "delve in a tilde fence",
  "~~~",
].join("\n");

{
  const out = stripCode(MD);
  eq("stripCode keeps the line count", out.split("\n").length, MD.split("\n").length);
  eq("stripCode leaves one delve, the prose one", (out.match(/delve/g) || []).length, 1);
  eq("stripCode blanks the backtick fence and its lines", out.split("\n").slice(4, 7).join("").trim(), "");
  eq("stripCode blanks the tilde fence", out.split("\n").slice(12, 15).join("").trim(), "");
  eq("stripCode blanks a multi-line HTML comment", out.split("\n").slice(8, 10).join("").trim(), "");
  eq("stripCode keeps the prose line", out.split("\n")[10], "Plain delve stays.");
  yes("stripCode blanks inline code and URLs", !out.includes("`") && !out.includes("http"));
}

console.log("\nprose.mjs proseSpans");

{
  const spans = proseSpans(MD, "/repo/README.md");
  eq("prose file yields one span at line 1", spans.length && spans[0].line, 1);
  eq("prose span text is stripCode output", spans[0].text, stripCode(MD));
  yes("every prose extension is listed", PROSE_EXTENSIONS.includes("md") && PROSE_EXTENSIONS.includes("adoc"));
}

{
  const ts = "const a = 1;\n// first note\n// second note\nconst b = 2;\n/*\n block\n*/\n";
  const spans = proseSpans(ts, "/repo/src/index.ts");
  eq("comment file yields one span per comment run", spans.length, 2);
  eq("line comment run starts at line 2", spans[0].line, 2);
  eq("line comment run holds both lines", spans[0].text, "// first note\n// second note");
  eq("block comment run starts at line 5", spans[1].line, 5);
  yes("string literals are not scanned", !spans.some((s) => s.text.includes("const a")));
}

eq("json yields no spans", proseSpans('{"a": "delve"}', "/repo/data.json"), []);
eq("unknown extension yields no spans", proseSpans("delve", "/repo/x.lock"), []);

console.log("\nprose.mjs gitCommitMessages");

eq("single -m", gitCommitMessages('git commit -m "fix parser"'), ["fix parser"]);
eq("single-quoted -m", gitCommitMessages("git commit -m 'fix parser'"), ["fix parser"]);
eq("repeated -m keeps order", gitCommitMessages('git commit -m "one" -m "two"'), ["one", "two"]);
eq("--message=", gitCommitMessages('git commit --message="fix parser"'), ["fix parser"]);
eq("--message= single quotes", gitCommitMessages("git commit --message='fix parser'"), ["fix parser"]);
eq("combined -am flag", gitCommitMessages('git commit -am "fix parser"'), ["fix parser"]);
eq("-m with no space, double quotes", gitCommitMessages('git commit -m"fix parser"'), ["fix parser"]);
eq("-m with no space, single quotes", gitCommitMessages("git commit -m'fix parser'"), ["fix parser"]);
eq("non-commit command", gitCommitMessages('git log --format="%s"'), []);
eq("gh command is not a commit", gitCommitMessages('gh pr create --body "delve"'), []);

{
  const body = "fix parser\n\nThe heredoc body wins over the $(cat wrapper).";
  const command = `git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`;
  eq("heredoc -m form", gitCommitMessages(command), [body]);
}

{
  const command = `git commit -m "first" -m "$(cat <<'EOF'\nsecond body\nEOF\n)"`;
  eq("mixed -m forms keep order", gitCommitMessages(command), ["first", "second body"]);
}

console.log("\nem-dash.mjs findDashes");

{
  const text = "the parser — which fails";
  const [hit, ...rest] = findDashes(text);
  eq("one em dash", rest.length, 0);
  eq("em dash char", hit.char, "—");
  eq("em dash line", hit.line, 1);
  eq("em dash col", hit.col, text.indexOf("—") + 1);
  yes("snippet shows the context", hit.snippet.includes("parser") && hit.snippet.length <= 40, hit.snippet);
}

{
  const text = "line one\nthe range 3–5 fails";
  eq("en dash on by default", findDashes(text).map((d) => [d.char, d.line]), [["–", 2]]);
  eq("en dash off", findDashes(text, { enDash: false }), []);
}

{
  const text = "wait -- then run";
  eq("double hyphen off by default", findDashes(text), []);
  eq("double hyphen on", findDashes(text, { doubleHyphen: true }).map((d) => d.char), ["--"]);
  eq("double hyphen between words", findDashes("foo--bar", { doubleHyphen: true }).map((d) => d.char), ["--"]);
  eq("--flag never matches", findDashes("run --flag now", { doubleHyphen: true }), []);
  eq("--flag never matches at line start", findDashes("--flag\n--other", { doubleHyphen: true }), []);
}

{
  const hits = findDashes("first\nsecond — tail\nthird — end");
  eq("dash lines", hits.map((d) => d.line), [2, 3]);
  yes("snippet collapses newlines", !hits[0].snippet.includes("\n"));
}

console.log("\nai-patterns.mjs categories");

const CASES_DIR = new URL("./patterns-cases/", import.meta.url);
const POSITIVE = {};
const NEAR_MISS = {};
const PRESET_IDS = {};
for (const file of readdirSync(CASES_DIR).filter((name) => name.endsWith(".json")).sort()) {
  const data = JSON.parse(readFileSync(new URL(file, CASES_DIR), "utf8"));
  Object.assign(POSITIVE, data.positive);
  Object.assign(NEAR_MISS, data.nearMiss);
  for (const [preset, cats] of Object.entries(data.presets || {})) PRESET_IDS[preset] = [...(PRESET_IDS[preset] || []), ...cats];
}
PRESET_IDS.all = CATEGORIES.map((c) => c.id);

eq("every category is covered by a positive case", CATEGORIES.map((c) => c.id).filter((id) => !POSITIVE[id]), []);
eq("every case names a loaded category", Object.keys(POSITIVE).filter((id) => !CATEGORIES.some((c) => c.id === id)), []);

for (const cat of CATEGORIES) {
  const hits = scan(POSITIVE[cat.id], { categories: [cat.id] });
  yes(`${cat.id} flags its example`, hits.length > 0, POSITIVE[cat.id]);
  yes(`${cat.id} reports a fix`, hits.every((h) => h.fix && h.label === cat.label));
  eq(`${cat.id} passes its near miss`, matchesOnly(NEAR_MISS[cat.id], cat.id), []);
  eq(`${cat.id} owns its example alone`, ids(POSITIVE[cat.id]), [cat.id]);
}

console.log("\nai-patterns.mjs near misses in real text");

eq("a URL with delve is stripped before the scan", ids(proseSpans("See https://ai.dev/delve for docs.\n", "n.md")[0].text), []);
eq("the initial value passes under default", ids("the initial value", { categories: [...resolveCategories({ preset: "default" }, loaded).ids] }), []);
eq("the initial value fails under ste", ids("the initial value", { categories: ["ste"] }), ["ste"]);
eq("--flag is not a dash finding", findDashes("pass --flag to the CLI", { doubleHyphen: true }), []);
eq("delve inside an identifier is skipped", ids("const delveX = 1; // delveIntoTree()"), []);

console.log("\nai-patterns.mjs presets");

for (const [preset, expected] of Object.entries(PRESET_IDS)) {
  const resolved = resolveCategories({ preset }, loaded);
  eq(`preset ${preset} resolves to its category list`, [...resolved.ids].sort(), [...expected].sort());
}

eq(
  "presets.json lists every preset name",
  Object.keys(PRESETS).sort(),
  ["all", "default", "git", "minimal", "ryan", "statistical", "ste", "technical"],
);
eq("technical carries its allow list", resolveCategories({ preset: "technical" }, loaded).allow.includes("robust"), true);
eq("technical allows robust in a scan", ids("A robust parser.", { categories: [...resolveCategories({ preset: "technical" }, loaded).ids] }).length > 0, true);
eq(
  "technical preset allow drops robust",
  (() => {
    const { ids: on, allow } = resolveCategories({ preset: "technical" }, loaded);
    return scan("A robust parser.", { categories: on, allow });
  })(),
  [],
);
eq("config allow merges with the preset allow", resolveCategories({ preset: "technical", allow: ["parser"] }, loaded).allow.slice(-1), ["parser"]);
eq("unknown preset falls back to default", [...resolveCategories({ preset: "nope" }, loaded).ids].sort(), [...PRESET_IDS.default].sort());
eq("no preset falls back to default", [...resolveCategories({}, loaded).ids].sort(), [...PRESET_IDS.default].sort());
eq("categories override the preset", [...resolveCategories({ preset: "all", categories: ["chatbot"] }, loaded).ids], ["chatbot"]);
eq("unknown category ids are dropped", [...resolveCategories({ categories: ["chatbot", "nope"] }, loaded).ids], ["chatbot"]);
eq(
  "a categories override ignores delve",
  scan("We delve into it.", { categories: resolveCategories({ categories: ["chatbot"] }, loaded).ids }),
  [],
);

console.log("\nai-patterns.mjs formatting");

const formatting = (text) => scan(text, { categories: ["formatting"] });

eq("emoji in a heading", formatting("## Ship it \u{1F680}\n").length > 0, true);
eq("emoji ending a line", formatting("All tests pass \u{1F389}\nnext line\n").map((h) => h.line), [1]);
eq("a heading without an emoji passes", formatting("## Ship it\n"), []);
eq(
  "three bold spans in one paragraph",
  formatting("The **parser** reads the **tokens** and writes the **tree**.").map((h) => h.fix),
  ["restructure so the sentence leads with the point"],
);
eq("two bold spans pass", formatting("The **parser** reads the **tokens**."), []);
eq(
  "bold spans spread over paragraphs pass",
  formatting("The **parser** reads.\n\nIt writes the **tokens** and the **tree**."),
  [],
);
eq("a bold-lead bullet list passes", formatting("- **A**: one\n- **B**: two\n- **C**: three"), []);
eq("a bold-lead numbered list passes", formatting("1. **A** one\n2. **B** two\n3. **C** three"), []);
eq("three bold spans in one list item flag", formatting("- **A** and **B** and **C**").length, 1);

console.log("\nai-patterns.mjs inflections and articles");

eq("delving is flagged", matchesOnly("We are delving into it.", "vocabulary"), ["delving"]);
eq("utilizing is flagged", matchesOnly("Utilizing the helper.", "wordiness"), ["Utilizing"]);
eq("plays an important role", matchesOnly("It plays an important role.", "copula"), ["plays an important role"]);
eq("That's an excellent point", matchesOnly("That's an excellent point.", "sycophancy"), ["That's an excellent point"]);
eq("an important reminder that", matchesOnly("It is an important reminder that we test.", "filler"), ["an important reminder that"]);

console.log("\nai-patterns.mjs reveal opener and scan cost");

eq("Enter as a reveal is flagged", matchesOnly("Enter Redis.", "structure"), ["Enter Redis."]);
eq("Enter mid-sentence passes", matchesOnly("Then press Enter Now.", "structure"), []);
{
  const para = "It is not just a robust parser, it is a comprehensive toolkit we leverage across the landscape.\n\n";
  const text = para.repeat(Math.ceil((300 * 1024) / para.length));
  const started = process.hrtime.bigint();
  scan(text, { categories: [...resolveCategories({ preset: "all" }, loaded).ids] });
  yes("300 KB scans in under 500 ms", Number(process.hrtime.bigint() - started) / 1e6 < 500);
}

console.log("\nai-patterns.mjs reported shape");

{
  const [hit] = scan("ok\n\nWe delve into it.", { categories: ["vocabulary"] });
  eq("finding line is 1-based inside the text", hit.line, 3);
  eq("finding keys", Object.keys(hit).sort(), ["category", "fix", "label", "line", "match"]);
  eq("findings are ordered by position", scan("Moreover, we delve in.").map((h) => h.match), ["Moreover", "delve"]);
  eq("empty text scans clean", scan(""), []);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) process.exit(summary());
