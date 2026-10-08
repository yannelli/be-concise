import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, ok, bad } from "./lib.mjs";
import { operations, entryFrom } from "../tools/operations.mjs";
import { checkText } from "../tools/check.mjs";
import { addEntry, listDictionary, normalizeEntry, removeEntry, testEntry } from "../tools/dictionary-ops.mjs";
import { getSetting, mergeDelta, planEdit, resolveLayer, settingKeys, validateSettings } from "../tools/settings.mjs";
import { loadConfig } from "../hooks/lib/config.mjs";

const dirs = [];
const show = (value) => JSON.stringify(value);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual).slice(0, 400)));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const layerFile = (dir) => join(dir, ".claude", "concise.json");

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "concise-cov-ops-"));
  dirs.push(dir);
  return dir;
}

function project(config) {
  const dir = tempDir();
  mkdirSync(join(dir, ".claude"));
  if (config !== undefined) writeFileSync(layerFile(dir), typeof config === "string" ? config : JSON.stringify(config));
  return dir;
}

async function rejects(name, fn, pattern) {
  try {
    await fn();
    bad(name, "no error");
  } catch (error) {
    check(name, pattern.test(error.message), error.message);
  }
}

console.log("\ncoverage: operations");

{
  const shown = operations.show({});
  check("show falls back to the working directory", shown.cwd === process.cwd(), shown.cwd);
  const dir = project({ maxRetries: 2 });
  check("show takes cwd and env from the arguments", operations.show({ cwd: dir, env: {} }).effective.maxRetries === 2, dir);
  check("keys filters by the query", operations.keys({ query: "maxRetries" }).keys.some((row) => row.key === "maxRetries"), "keys");
  const edited = operations.edit({ cwd: dir, env: {}, key: "maxRetries", value: 5 });
  check("edit defaults op to set", edited.changed && edited.diff.includes("\"maxRetries\": 5") && !edited.applied, edited);
  check("dictionary defaults action to list", Array.isArray(operations.dictionary({ cwd: dir, env: {} }).entries), "list");
  await rejects("dictionary rejects an unknown action", () => operations.dictionary({ cwd: dir, env: {}, action: "zap" }), /action must be list, add, remove, or test/);
  check("entryFrom merges an entry object with flat fields", show(entryFrom({ entry: { value: "a" }, fix: "b" })) === show({ match: "exact", value: "a", fix: "b" }), entryFrom({ entry: { value: "a" }, fix: "b" }));
}

{
  const dir = project({});
  await rejects("tune needs samples", () => operations.tune({ cwd: dir, env: {} }), /No samples/);
  const sample = join(dir, "notes.md");
  writeFileSync(sample, "A short note about the parser.\n");
  const result = await operations.tune({ cwd: dir, env: {}, paths: [sample], texts: ["Second sample text."], kind: "reply" });
  check("tune reads paths and texts into samples", result.samples === 2 && result.kind === "reply" && result.applied === false, result);
  const docs = await operations.tune({ cwd: dir, env: {}, texts: ["One more sample."] });
  check("tune defaults kind to docs", docs.kind === "docs" && docs.samples === 1, docs);
}

console.log("\ncoverage: check");

{
  const dir = project({});
  const env = {};
  await rejects("check rejects an unknown scope", () => checkText({ text: "x", scope: "nope", cwd: dir, env }), /scope must be one of/);
  await rejects("check rejects an unknown hook", () => checkText({ text: "x", hook: "nope", cwd: dir, env }), /hook must be one of/);
  const bypassDir = project({ bypass: { phrases: ["ship it"] } });
  const bypassed = await checkText({ text: "ship it now", cwd: bypassDir, env });
  check("a bypass phrase returns clean with no findings", bypassed.clean && bypassed.bypass && bypassed.message === null, bypassed);
}

{
  const dir = project({ maxCommentLines: 2, maxFileLines: 3, maxPrBodyParagraphs: 1 });
  const env = {};
  const comments = await checkText({ text: "// a\n// b\n// c\nconst x = 1;\n// d concise-ignore\n// e\n// f\n", scope: "comments", cwd: dir, env });
  const runs = comments.core.filter((item) => item.check === "comments");
  check("a long comment run is reported with its line", runs.length === 1 && runs[0].line === 1 && /comment run of 3 lines \(limit 2\)/.test(runs[0].reason), comments.core);
  check("a long comment scope text also trips the file size check", comments.core.some((item) => item.check === "fileSize" && /8 lines as a new file \(limit 3\)/.test(item.reason)), comments.core);
  const prose = await checkText({ text: "one\ntwo\nthree\nfour", scope: "files", path: "notes.md", cwd: dir, env });
  check("files scope with a path keeps the path and checks size", prose.path === "notes.md" && prose.core.some((item) => item.check === "fileSize"), prose);
  const body = "First paragraph of prose that explains the change.\n\nSecond paragraph of prose that explains it again.";
  const gh = await checkText({ text: body, scope: "gh", cwd: dir, env });
  check("a verbose PR body is a prBody finding", gh.core.some((item) => item.check === "prBody") && !gh.clean, gh.core);
}

{
  const dir = project({ features: { emDash: { enabled: true, replies: true }, aiWriting: { enabled: true, replies: true, preset: "all" } } });
  const env = {};
  const result = await checkText({ text: "We delve into it.\nA pause \u2014 then more.\nLet us delve again.", scope: "reply", cwd: dir, env });
  const lines = result.findings.map((item) => item.line);
  check("reply findings include aiWriting and dash hits", result.findings.some((item) => item.category === "emDash") && result.findings.some((item) => item.category !== "emDash"), result.findings);
  check("findings are sorted by line", lines.every((line, i) => i === 0 || lines[i - 1] <= line) && lines.length >= 3, lines);
  const config = { ...loadConfig(dir, env), checks: undefined };
  const noChecks = await checkText({ text: "one line", scope: "files", cwd: dir, env, config });
  check("a config without checks runs the core checks", noChecks.core.length === 0 && noChecks.path === "check.md", noChecks);
}

console.log("\ncoverage: dictionary-ops");

{
  let thrown = "";
  try { normalizeEntry("word"); } catch (error) { thrown = error.message; }
  check("normalizeEntry rejects a non-object", thrown === "entry must be an object", thrown);
  try { normalizeEntry({ match: "exact", value: 7, fix: "x" }); } catch (error) { thrown = error.message; }
  check("an entry with no id and a non-string value names no id", thrown.startsWith("Dictionary entry is invalid: bad id null"), thrown);
}

{
  const entries = [{ id: "env-term", match: "exact", value: "zorb", fix: "zap" }, { id: "broken", match: "regex", value: "(", fix: "x" }];
  const env = { BEC_CONFIG_JSON: JSON.stringify({ features: { dictionary: { entries } } }) };
  const listed = listDictionary({ cwd: project(), env });
  const term = listed.entries.find((entry) => entry.id === "env-term");
  const broken = listed.entries.find((entry) => entry.id === "broken");
  check("an entry no layer file sets comes from the environment", term?.layer === "environment" && !("problem" in term), listed.entries);
  check("an unusable entry carries its problem", broken?.layer === "environment" && /does not compile/.test(broken.problem), broken);
  const invalidJson = listDictionary({ cwd: project("{ not json"), env: { BEC_CONFIG_JSON: env.BEC_CONFIG_JSON } });
  check("a layer file that is not JSON owns no entries", invalidJson.entries.every((entry) => entry.layer === "environment"), invalidJson.entries);
  const noEntries = listDictionary({ cwd: project({ maxRetries: 2 }), env: { BEC_CONFIG_JSON: env.BEC_CONFIG_JSON } });
  check("a layer file with no entries list owns no entries", noEntries.entries.find((entry) => entry.id === "env-term")?.layer === "environment", noEntries.entries);
}

{
  const term = (id, fix) => ({ id, match: "exact", value: id, fix });
  const dir = project({ features: { dictionary: { entries: [term("shared", "project")] } } });
  writeFileSync(join(dir, "env.json"), JSON.stringify({ features: { dictionary: { entries: [term("shared", "env"), term("pinned", "env")] } } }));
  const listed = listDictionary({ cwd: dir, env: { BEC_CONFIG_PATH: "env.json" } }).entries;
  const owner = (id) => listed.find((entry) => entry.id === id);
  check("the project file owns an entry it shares with the BEC_CONFIG_PATH file", owner("shared")?.layer === "project-claude" && owner("shared").fix === "project", listed);
  check("the BEC_CONFIG_PATH file owns its own entries", owner("pinned")?.layer === "env-config", listed);
  const fresh = project();
  writeFileSync(join(fresh, "env.json"), "{}");
  const plan = planEdit({ cwd: fresh, env: { BEC_CONFIG_PATH: "env.json" }, edits: [{ op: "set", key: "maxRetries", value: 3 }] });
  check("the project layer is a new project file, not the BEC_CONFIG_PATH file", plan.layer.id === "project-claude" && !plan.layer.exists, plan.layer);
}

{
  const dir = project({ features: { dictionary: { enabled: false } } });
  const env = {};
  const added = addEntry({ cwd: dir, env, entry: { match: "exact", value: "Foo Bar", fix: "foo" }, apply: true });
  check("addEntry notes a disabled dictionary", added.notes.length === 1 && /enabled is false/.test(added.notes[0]) && added.entry.id === "foo-bar", added);
  const replaced = addEntry({ cwd: dir, env, entry: { id: "foo-bar", match: "exact", value: "Foo Bar", fix: "bar" }, replace: true, apply: true });
  check("replace overwrites the entry in place", replaced.applied && readJson(layerFile(dir)).features.dictionary.entries.length === 1
    && readJson(layerFile(dir)).features.dictionary.entries[0].fix === "bar", readJson(layerFile(dir)));
  const disabled = removeEntry({ cwd: dir, env, id: "foo-bar", disable: true });
  check("disable switches off an entry in the same layer", show(JSON.parse(disabled.text).features.dictionary.entries) === show([{ id: "foo-bar", enabled: false }]), disabled.text);
}

{
  const dir = project({ features: { dictionary: { entries: [{ id: "solo", match: "exact", value: "solo", fix: "one" }] } } });
  const removed = removeEntry({ cwd: dir, env: {}, id: "solo", apply: true });
  check("removing the last entry prunes the empty parents", removed.applied && show(readJson(layerFile(dir))) === "{}", readJson(layerFile(dir)));
  let thrown = "";
  try { removeEntry({ cwd: dir, env: {}, id: "" }); } catch (error) { thrown = error.message; }
  check("removeEntry needs an id", thrown === "id is required", thrown);
  try { removeEntry({ cwd: dir, env: {}, id: "ghost" }); } catch (error) { thrown = error.message; }
  check("an id set nowhere names no owner", thrown === "Entry \"ghost\" is not in this layer.", thrown);
}

{
  const entry = { match: "exact", value: "zorb", fix: "zap" };
  let thrown = "";
  try { testEntry({ entry, text: "zorb", scope: "nope" }); } catch (error) { thrown = error.message; }
  check("testEntry rejects an unknown scope", /^scope must be one of/.test(thrown), thrown);
  try { testEntry({ entry, text: "zorb", hook: "nope" }); } catch (error) { thrown = error.message; }
  check("testEntry rejects an unknown hook", /^hook must be one of/.test(thrown), thrown);
  const hooked = testEntry({ entry, text: "a zorb", hook: "stop" });
  check("testEntry runs with a valid hook", hooked.matches.length === 1 && hooked.hook === "stop", hooked);
  const empty = testEntry({ entry });
  check("testEntry with no text finds nothing", empty.matches.length === 0, empty);
}

console.log("\ncoverage: settings");

{
  const dir = project({ allowList: { phrases: ["a"], patterns: ["b"] }, maxRetries: 2 });
  const env = {};
  const kept = planEdit({ cwd: dir, env, edits: [{ op: "unset", key: "allowList.phrases" }] });
  check("unset keeps a parent that still has keys", show(JSON.parse(kept.text).allowList) === show({ patterns: ["b"] }), kept.text);
  const missing = planEdit({ cwd: dir, env, edits: [{ op: "unset", key: "nothing.here.deep" }] });
  check("unset under a missing parent changes nothing", missing.changed === false, missing);
  const errors = [];
  for (const edit of [{ op: "zap", key: "maxRetries" }, { op: "set", key: "9bad", value: 1 }, { op: "add", key: "maxRetries", value: 1 }]) {
    try { planEdit({ cwd: dir, env, edits: [edit] }); errors.push("none"); } catch (error) { errors.push(error.message); }
  }
  check("a bad op, a bad key, and add on a scalar are refused", /^op must be one of set, unset, add, remove$/.test(errors[0])
    && errors[1] === "Bad key \"9bad\"" && errors[2] === "maxRetries is not a list", errors);
}

{
  const dir = project("[1, 2]");
  let thrown = "";
  try { planEdit({ cwd: dir, env: {}, edits: [] }); } catch (error) { thrown = error.message; }
  check("a layer file holding an array is refused", thrown.endsWith("is not a JSON object"), thrown);
  const asDir = tempDir();
  mkdirSync(layerFile(asDir), { recursive: true });
  try { planEdit({ cwd: asDir, env: {}, edits: [] }); } catch (error) { thrown = error.message; }
  check("a layer that cannot be read reports the read error", /EISDIR/.test(thrown), thrown);
}

{
  const dir = project("{ broken");
  const got = getSetting({ cwd: dir, env: {}, key: "not.documented" });
  check("get reports a layer parse error and omits the description", got.layers[0].error.includes("is not valid JSON") && !("description" in got), got);
  check("validate reports the same file as invalid", validateSettings({ cwd: dir, env: {} }).ok === false, "validate");
}

{
  const home = tempDir();
  const state = { layers: [{ id: "env-config", active: true }, { id: "user-xdg", active: false }, { id: "user-claude", active: false }, { id: "project-claude", active: false }] };
  check("user resolves to the first user layer when none is in effect", resolveLayer(state, "user").id === "user-xdg", state);
  check("project resolves to the Claude file, not the BEC_CONFIG_PATH file", resolveLayer(state, "project", home).id === "project-claude", state);
}

{
  check("mergeDelta replaces a scalar with an object", show(mergeDelta({ a: 1 }, { a: { b: 2 } })) === show({ a: { b: 2 } }), mergeDelta({ a: 1 }, { a: { b: 2 } }));
  const preload = join(tempDir(), "no-docs.mjs");
  writeFileSync(preload, [
    "import fs from \"node:fs\";",
    "import { syncBuiltinESMExports } from \"node:module\";",
    "const real = fs.existsSync;",
    "fs.existsSync = (path) => (String(path).endsWith(\"configuration.md\") ? false : real(path));",
    "syncBuiltinESMExports();",
  ].join("\n"));
  const url = pathToFileURL(join(ROOT, "tools", "settings.mjs")).href;
  const code = `const { settingKeys } = await import(${show(url)}); console.log(JSON.stringify(settingKeys()));`;
  const child = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, "--input-type=module", "-e", code], { encoding: "utf8" });
  check("settingKeys returns no rows when the docs file is missing", child.stdout.trim() === "[]" && settingKeys().length > 0, child);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
