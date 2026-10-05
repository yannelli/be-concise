import { ok, bad } from "./lib.mjs";
import { compileEntry, dictionaryActive, dictionaryEntries, entryProblem, mergeEntries, scanDictionary } from "../hooks/lib/dictionary.mjs";
import { applyLayer } from "../hooks/lib/config-layers.mjs";
import { defaultConfig, loadConfig } from "../hooks/lib/config.mjs";
import { contextText } from "../hooks/lib/context.mjs";

const show = (value) => JSON.stringify(value);
const eq = (name, actual, expected) => (show(actual) === show(expected) ? ok(name) : bad(name, `expected ${show(expected)}, got ${show(actual)}`));
const entry = (fields) => compileEntry({ id: "t", fix: "f", ...fields });
const hits = (fields, text, where = {}) => scanDictionary(text, [entry(fields)], where).map((hit) => [hit.match, hit.line]);

console.log("\ndictionary: matching");

const matrix = [
  ["word exact skips longer words", { match: "exact", value: "leverage" }, "We leverage it. leveraged. Leverage!", [["leverage", 1], ["Leverage", 1]]],
  ["word exact keeps symbols at the edges", { match: "exact", value: "C++" }, "Use C++ or C++17 or xC++", [["C++", 1]]],
  ["word exact matches a leading symbol", { match: "exact", value: "#tag" }, "a #tag b#tag", [["#tag", 1]]],
  ["word exact handles accented letters", { match: "exact", value: "café" }, "un café, cafés", [["café", 1]]],
  ["word exact spans a wrapped phrase", { match: "exact", value: "in order to" }, "this is in\norder to go", [["in\norder to", 1]]],
  ["word startsWith reports the whole word", { match: "startsWith", value: "synerg" }, "synergy and Synergies, asynergy", [["synergy", 1], ["Synergies", 1]]],
  ["word endsWith reports the whole word", { match: "endsWith", value: "ize" }, "optimize realize sized", [["optimize", 1], ["realize", 1]]],
  ["word contains reports the whole word", { match: "contains", value: "erg" }, "synergy energy egg", [["synergy", 1], ["energy", 1]]],
  ["caseSensitive keeps case", { match: "exact", value: "API", caseSensitive: true }, "api API Api", [["API", 1]]],
  ["line startsWith ignores indentation", { match: "startsWith", on: "line", value: "Fixes #" }, "  Fixes #12\nNot Fixes #3", [["Fixes #", 1]]],
  ["line endsWith ignores trailing space", { match: "endsWith", on: "line", value: "Hope this helps!" }, "Done. Hope this helps!  \nHope this helps! more", [["Hope this helps!", 1]]],
  ["line exact needs the whole line", { match: "exact", on: "line", value: "Thanks" }, "Thanks\n Thanks \nThanks a lot", [["Thanks", 1], ["Thanks", 2]]],
  ["line contains matches inside a line", { match: "contains", on: "line", value: "TODO" }, "a TODO b\ntodo", [["TODO", 1], ["todo", 2]]],
  ["text startsWith anchors the span", { match: "startsWith", on: "text", value: "Great question" }, "\nGreat question! x\nGreat question", [["Great question", 2]]],
  ["text endsWith anchors the span", { match: "endsWith", on: "text", value: "Let me know" }, "Let me know\nok. Let me know\n", [["Let me know", 2]]],
  ["text exact needs the whole span", { match: "exact", on: "text", value: "LGTM" }, "  LGTM \n", [["LGTM", 1]]],
  ["regex is case-insensitive by default", { match: "regex", value: "\\bJIRA-\\d+\\b" }, "fix jira-12 and JIRA-7", [["jira-12", 1], ["JIRA-7", 1]]],
  ["regex flags replace the default", { match: "regex", value: "JIRA-\\d+", flags: "" }, "jira-12 JIRA-7", [["JIRA-7", 1]]],
  ["regex hit group narrows the match", { match: "regex", value: "see (?<hit>JIRA-\\d+)" }, "see JIRA-3", [["JIRA-3", 1]]],
];
for (const [name, fields, text, expected] of matrix) eq(name, hits(fields, text), expected);

eq("comment markers are blanked for line anchors",
  hits({ match: "startsWith", on: "line", value: "Fixes" }, "// Fixes a\n  # Fixes b\n/* Fixes c */\n * Fixes d", { scope: "comments" }),
  [["Fixes", 1], ["Fixes", 2], ["Fixes", 3], ["Fixes", 4]]);
eq("hooks limit an entry", hits({ match: "exact", value: "x1", hooks: ["stop"] }, "x1", { hook: "edit" }), []);
eq("a listed hook runs the entry", hits({ match: "exact", value: "x1", hooks: ["stop"] }, "x1", { hook: "stop" }), [["x1", 1]]);
eq("the default scopes leave out command", hits({ match: "exact", value: "x1" }, "x1", { scope: "command" }), []);
eq("scopes opt into command", hits({ match: "exact", value: "x1", scopes: ["command"] }, "x1", { scope: "command" }), [["x1", 1]]);
eq("matches come back in text order", scanDictionary("b a", [entry({ id: "a", match: "exact", value: "a" }), entry({ id: "b", match: "exact", value: "b" })]).map((hit) => hit.id), ["b", "a"]);

console.log("\ndictionary: validation");

const valid = { id: "ok", match: "exact", value: "v", fix: "f" };
const reasons = [
  ["a bad id", { ...valid, id: "Bad" }, /bad id/],
  ["an unknown match", { ...valid, match: "fuzzy" }, /match must be one of/],
  ["an empty value", { ...valid, value: "" }, /value must be/],
  ["a missing fix", { ...valid, fix: undefined }, /fix must be/],
  ["an unknown unit", { ...valid, on: "page" }, /on must be one of/],
  ["flags on a literal entry", { ...valid, flags: "i" }, /flags applies to a regex entry only/],
  ["an unknown hook", { ...valid, hooks: ["nope"] }, /unknown hook "nope"/],
  ["an empty scope list", { ...valid, scopes: [] }, /scopes must be a non-empty array/],
  ["a regex that does not compile", { ...valid, match: "regex", value: "(" }, /does not compile/],
];
for (const [name, raw, pattern] of reasons) {
  const reason = entryProblem(raw);
  if (pattern.test(reason || "")) ok(`entryProblem rejects ${name}`);
  else bad(`entryProblem rejects ${name}`, show(reason));
}
eq("a switched-off entry needs only its id", entryProblem({ id: "gone", enabled: false }), null);
eq("a full entry is valid", entryProblem(valid), null);

const withEntries = (entries, enabled = true) => ({ features: { dictionary: { enabled, mode: "confirm", entries } } });
eq("no entries keeps the feature idle", dictionaryActive(withEntries([])), false);
eq("enabled false keeps the feature idle", dictionaryActive(withEntries([valid], false)), false);
eq("only switched-off entries keep it idle", dictionaryActive(withEntries([{ id: "a", enabled: false }])), false);
eq("one live entry activates it", dictionaryActive(withEntries([valid])), true);
const split = dictionaryEntries(withEntries([valid, { id: "bad", match: "exact" }, { id: "off", enabled: false }]));
eq("dictionaryEntries compiles the usable entries", split.entries.map((item) => item.id), ["ok"]);
eq("dictionaryEntries lists the unusable ones", split.problems.map((item) => item.id), ["bad"]);

console.log("\ndictionary: config layers");

eq("mergeEntries unions by id and replaces in place", mergeEntries([{ id: "a", v: 1 }, { id: "b" }], [{ id: "a", v: 2 }, { id: "c" }]), [{ id: "a", v: 2 }, { id: "b" }, { id: "c" }]);
{
  let config = applyLayer(defaultConfig(), withEntries([valid, { ...valid, id: "two" }]));
  config = applyLayer(config, { features: { dictionary: { mode: "deny", entries: [{ id: "ok", enabled: false }] } } });
  eq("a higher layer switches off a lower entry by id", config.features.dictionary.entries.map((item) => [item.id, item.enabled !== false]), [["ok", false], ["two", true]]);
  eq("a higher layer keeps the other dictionary keys merged", [config.features.dictionary.enabled, config.features.dictionary.mode], [true, "deny"]);
  config = applyLayer(config, { features: { aiWriting: { enabled: true } } });
  eq("an unrelated layer keeps the entries", config.features.dictionary.entries.length, 2);
}
{
  const config = loadConfig("/nonexistent", { BEC_CONFIG_JSON: show({ features: { dictionary: { entries: "x" } } }) });
  eq("a non-list entries value is reported and reset", [config.features.dictionary.entries, config.problems.map((item) => item.source)], [[], ["features.dictionary.entries"]]);
}
{
  const env = { BEC_CONFIG_JSON: show(withEntries([valid])), BEC_FEATURE_ALWAYS_DISABLE: "dictionary" };
  eq("BEC_FEATURE_ALWAYS_DISABLE turns the dictionary off", loadConfig("/nonexistent", env).features.dictionary.enabled, false);
}
{
  const text = contextText(applyLayer(defaultConfig(), withEntries([valid, { id: "off", enabled: false }])));
  if (/dictionary: confirm; 1 entry \(ok\)\./.test(text)) ok("session context names the live entries");
  else bad("session context names the live entries", text);
}
