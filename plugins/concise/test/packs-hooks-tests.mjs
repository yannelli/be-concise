#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { ok, bad, summary, withConfig, run, CHECK_EDIT, CHECK_BASH, assertDenied, assertAllowed } from "./lib.mjs";

const dirs = [];
let seq = 0;

/** One tmp project with its own config and its own pack files. */
function project(aiWriting, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "concise-packs-"));
  dirs.push(dir);
  withConfig(dir, { features: { aiWriting: { enabled: true, ...aiWriting } } });
  for (const [rel, body] of Object.entries(files)) write(dir, rel, body);
  seq += 1;
  return { dir, sid: `packs-${process.pid}-${seq}` };
}

function write(dir, rel, body) {
  const path = join(dir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  return path;
}

const pack = (id, patterns, extra = {}) => ({
  id,
  feature: "aiWriting",
  category: { id, label: id, description: `${id} test pack` },
  patterns,
  ...extra,
});

const writeEvent = ({ dir, sid }, name, content) => ({
  tool_name: "Write",
  tool_input: { file_path: join(dir, name), content },
  cwd: dir,
  session_id: sid,
});

const bashEvent = ({ dir, sid }, command) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd: dir,
  session_id: sid,
});

const reasonOf = (result) => result.hookSpecificOutput?.permissionDecisionReason || result.systemMessage || "";

function includes(name, result, needle) {
  if (reasonOf(result).includes(needle)) return ok(name);
  bad(name, `expected ${JSON.stringify(needle)} in ${JSON.stringify(reasonOf(result)).slice(0, 300)}`);
}

function eq(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return ok(name);
  bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const HOUSE = [{ phrase: "frobnicate", fix: "say what it does" }];

console.log("\npacks in the hooks (user sources)");

{
  const c = project({}, { ".claude/concise/patterns/house.json": pack("house", HOUSE) });
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", "We frobnicate the parser.\n"));
  assertDenied("a pack in .claude/concise/patterns adds findings", result);
  includes("the user category is named", result, "(house: say what it does)");
}

{
  const c = project({}, { ".codex/concise/patterns/house.json": pack("house", HOUSE) });
  assertDenied("a pack in .codex/concise/patterns adds findings", run(CHECK_EDIT, writeEvent(c, "doc.md", "We frobnicate it.\n")));
}

{
  const c = project({ excludePacks: ["house"] }, { ".claude/concise/patterns/house.json": pack("house", HOUSE) });
  assertAllowed("excludePacks drops the pack", run(CHECK_EDIT, writeEvent(c, "doc.md", "We frobnicate it.\n")));
}

{
  const c = project({ packs: ["solo.json", "extra"] }, {
    "solo.json": pack("solo", [{ phrase: "solofy", fix: "cut" }]),
    "extra/two.json": pack("two", [{ phrase: "twofy", fix: "cut" }]),
    "extra/nested/three.json": pack("three", [{ phrase: "threefy", fix: "cut" }]),
  });
  assertDenied("a packs file entry loads", run(CHECK_EDIT, writeEvent(c, "doc.md", "We solofy it.\n")));
  assertDenied("a packs directory entry loads", run(CHECK_EDIT, writeEvent(c, "b.md", "We twofy it.\n")));
  assertDenied("a packs directory entry recurses", run(CHECK_EDIT, writeEvent(c, "c.md", "We threefy it.\n")));
}

{
  const other = mkdtempSync(join(tmpdir(), "concise-abs-"));
  dirs.push(other);
  write(other, "away.json", pack("away", [{ phrase: "awayify", fix: "cut" }]));
  const c = project({ packs: [join(other, "away.json")] });
  assertDenied("an absolute packs entry loads", run(CHECK_EDIT, writeEvent(c, "doc.md", "We awayify it.\n")));
}

console.log("\npacks in the hooks (overrides and failures)");

{
  const replacement = pack("vocabulary", [{ phrase: "zzq", fix: "cut" }], {
    category: { id: "vocabulary", label: "AI frequency words" },
  });
  const c = project({}, { ".claude/concise/patterns/vocabulary.json": replacement });
  assertAllowed("a replaced built-in pack loses its own patterns", run(CHECK_EDIT, writeEvent(c, "doc.md", "We delve into it.\n")));
  assertDenied("the replacement patterns apply", run(CHECK_EDIT, writeEvent(c, "b.md", "We zzq it.\n")));
}

{
  const c = project({}, { ".claude/concise/patterns/broken.json": pack("broken", [{ phrase: "x" }]) });
  const first = run(CHECK_EDIT, writeEvent(c, "doc.md", "Clean text here.\n"));
  includes("an invalid pack is reported once", first, "skipped: pattern 0 needs a fix");
  includes("the warning names the pack path", first, "broken.json");
  const second = run(CHECK_EDIT, writeEvent(c, "b.md", "More clean text.\n"));
  eq("the warning is not repeated in the session", second, {});
}

{
  const c = project({}, { ".claude/concise/patterns/dup.json": "{ not json" });
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", "Clean text here.\n"));
  includes("unreadable JSON is reported as a skipped pack", result, "dup.json skipped:");
}

console.log("\npacks in the hooks (script packs)");

const SCRIPT = `export default {
  id: "shouty",
  feature: "aiWriting",
  category: { id: "shouty", label: "shouty" },
  detect(text) {
    const i = text.indexOf("TODO");
    return i === -1 ? [] : [{ index: i, match: "TODO", fix: "file an issue" }];
  },
};
`;

{
  const c = project({}, { ".claude/concise/patterns/shouty.mjs": SCRIPT });
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", "Ship it.\n\nTODO the rest.\n"));
  assertDenied("a script pack finding becomes a deny", result);
  includes("the script finding keeps its line", result, "line 3");
  includes("the script finding keeps its fix", result, "(shouty: file an issue)");
}

{
  const throwing = `export default {
  id: "thrower",
  feature: "aiWriting",
  category: { id: "thrower", label: "thrower" },
  detect() { throw new Error("boom"); },
};
`;
  const c = project({}, { ".claude/concise/patterns/thrower.mjs": throwing });
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", "Clean text here.\n"));
  includes("a throwing detect is reported as skipped", result, "detect failed: boom");
}

const CTX_PACK = `export default {
  id: "probe",
  feature: "aiWriting",
  category: { id: "probe", label: "probe" },
  options: { word: "alpha" },
  detect(text, ctx) {
    const at = text.indexOf(ctx.options.word);
    if (at === -1) return [];
    const words = ctx.stats.words().length;
    return [{ index: at, match: \`\${ctx.scope} \${words} \${ctx.path.endsWith(".md")}\`, fix: "cut" }];
  },
};
`;

{
  const c = project({}, { ".claude/concise/patterns/probe.mjs": CTX_PACK });
  const result = run(CHECK_EDIT, writeEvent(c, "doc.md", "one alpha three\n"));
  assertDenied("a script pack reads ctx.options by default", result);
  includes("ctx carries the scope, the stats, and the path", result, '"files 3 true"');
}

{
  const c = project({ options: { probe: { word: "beta" } } }, { ".claude/concise/patterns/probe.mjs": CTX_PACK });
  assertAllowed("the options override replaces the pack default", run(CHECK_EDIT, writeEvent(c, "doc.md", "one alpha three\n")));
  assertDenied("the override value is what detect sees", run(CHECK_EDIT, writeEvent(c, "b.md", "one beta three\n")));
}

console.log("\npacks in the hooks (scope)");

{
  const commitOnly = pack("commit-only", [{ phrase: "frobnicate", fix: "cut" }], { scope: ["commit"] });
  const c = project({}, { ".claude/concise/patterns/commit-only.json": commitOnly });
  assertAllowed("a commit-scoped pack stays quiet on a file write", run(CHECK_EDIT, writeEvent(c, "doc.md", "We frobnicate it.\n")));
  assertDenied("a commit-scoped pack fires on a commit message", run(CHECK_BASH, bashEvent(c, 'git commit -m "we frobnicate it"')));
}

{
  const commandOnly = pack("command-only", [{ regex: "--no-verify", fix: "run the hooks" }], { scope: ["command"] });
  const c = project({}, { ".claude/concise/patterns/command-only.json": commandOnly });
  const result = run(CHECK_BASH, bashEvent(c, 'git commit --no-verify -m "ok"'));
  assertDenied("a command-scoped pack fires on the command text", result);
  includes("the command is the label", result, "in command");
  assertAllowed("a command-scoped pack stays quiet on a file write", run(CHECK_EDIT, writeEvent(c, "doc.md", "run with --no-verify\n")));
}

{
  const ghOnly = pack("gh-only", [{ phrase: "frobnicate", fix: "cut" }], { scope: ["gh"] });
  const c = project({}, { ".claude/concise/patterns/gh-only.json": ghOnly });
  const command = 'gh pr create --title "x" --body "We frobnicate the parser."';
  assertDenied("a gh-scoped pack fires on a PR body", run(CHECK_BASH, bashEvent(c, command)));
}

{
  const comments = pack("comment-only", [{ phrase: "frobnicate", fix: "cut" }], { scope: ["comments"] });
  const c = project({}, { ".claude/concise/patterns/comment-only.json": comments });
  assertDenied("a comments-scoped pack fires in a code comment", run(CHECK_EDIT, writeEvent(c, "a.ts", "// we frobnicate here\nconst x = 1;\n")));
  assertAllowed("a comments-scoped pack stays quiet in prose", run(CHECK_EDIT, writeEvent(c, "doc.md", "We frobnicate it.\n")));
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) process.exit(summary());
