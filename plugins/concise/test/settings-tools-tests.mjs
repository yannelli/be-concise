import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, ok, bad } from "./lib.mjs";
import { applyPlan, lineDiff, mergeDelta, planEdit, settingKeys } from "../tools/settings.mjs";

const CLI = join(ROOT, "scripts", "concise-config.mjs");
const HOST_VARS = ["HOME", "USERPROFILE", "XDG_CONFIG_HOME"];
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !HOST_VARS.includes(key)));
const dirs = [];
const show = (value) => JSON.stringify(value);
const check = (name, condition, actual) => (condition ? ok(name) : bad(name, show(actual).slice(0, 400)));

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function project(config) {
  const dir = tempDir("concise-tools-");
  mkdirSync(join(dir, ".claude"));
  if (config) writeFileSync(join(dir, ".claude", "concise.json"), JSON.stringify(config, null, 2));
  return dir;
}

function cli(args, { env = {}, input = "" } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...BASE_ENV, ...env }, input });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const layerFile = (dir) => join(dir, ".claude", "concise.json");

console.log("\nsettings tools: edits");

{
  const dir = project();
  const file = layerFile(dir);
  const preview = cli(["set", "features.emDash.enabled", "true", "--cwd", dir]);
  check("set without --apply prints the diff", preview.code === 0 && preview.out.includes("+       \"enabled\": true") && preview.out.includes("Preview only"), preview);
  check("set without --apply leaves the file alone", !existsSync(file), preview);
  const written = cli(["set", "features.emDash.enabled", "true", "--cwd", dir, "--apply"]);
  check("set --apply writes the layer file", written.out.includes("Written.") && readJson(file).features.emDash.enabled === true, written);
  const again = cli(["set", "features.emDash.enabled", "true", "--cwd", dir, "--apply"]);
  check("an edit that changes nothing says so", again.out.includes("No change."), again);
  const got = JSON.parse(cli(["get", "features.emDash.enabled", "--cwd", dir, "--json"]).out);
  check("get reports the default, the effective value, the layer, and the docs", got.default === false && got.effective === true
    && got.layers[0].id === "project-claude" && got.layers[0].value === true && got.description === "Runs the dash check.", got);
}

{
  const dir = project({});
  const file = layerFile(dir);
  cli(["add", "allowList.phrases", "[\"alpha\",\"beta\"]", "--cwd", dir, "--apply"]);
  check("add appends list items", show(readJson(file).allowList.phrases) === show(["alpha", "beta"]), readJson(file));
  check("add skips an item already in the list", cli(["add", "allowList.phrases", "alpha", "--cwd", dir]).out.includes("No change."), readJson(file));
  cli(["remove", "allowList.phrases", "alpha", "--cwd", dir, "--apply"]);
  check("remove drops a list item", show(readJson(file).allowList.phrases) === show(["beta"]), readJson(file));
  cli(["unset", "allowList.phrases", "--cwd", dir, "--apply"]);
  check("unset removes the key and its empty parents", show(readJson(file)) === "{}", readJson(file));
  const invalid = cli(["set", "features.emDash.mode", "off", "--cwd", dir]);
  check("an invalid value exits 2 with the reason", invalid.code === 2 && invalid.err.includes("features.emDash.mode must be confirm, ask, or deny"), invalid);
  const unknown = cli(["set", "nope.key", "1", "--cwd", dir]);
  check("an unknown key exits 2", unknown.code === 2 && unknown.err.includes("Unknown configuration key: nope"), unknown);
  const notList = cli(["add", "maxRetries", "1", "--cwd", dir]);
  check("add on a scalar key exits 2", notList.code === 2 && notList.err.includes("maxRetries must be number"), notList);
}

{
  const dir = project({ maxRetries: 2 });
  const plan = planEdit({ cwd: dir, env: {}, edits: [{ op: "set", key: "maxRetries", value: 3 }] });
  writeFileSync(layerFile(dir), JSON.stringify({ maxRetries: 4 }));
  try {
    applyPlan(plan, {});
    bad("a write after the file changed is refused", "no error");
  } catch (error) {
    check("a write after the file changed is refused", error.status === 409 && /changed on disk/.test(error.message), error.message);
  }
  check("the refused write keeps the other edit", readJson(layerFile(dir)).maxRetries === 4, readJson(layerFile(dir)));
}

{
  const codex = tempDir("concise-codex-");
  mkdirSync(join(codex, ".codex"));
  const edit = [{ op: "set", key: "maxRetries", value: 3 }];
  check("project picks .codex when only .codex exists", planEdit({ cwd: codex, env: {}, edits: edit }).layer.id === "project-codex", codex);
  check("project picks .claude in a bare directory", planEdit({ cwd: tempDir("concise-bare-"), env: {}, edits: edit }).layer.id === "project-claude", edit);
  const home = tempDir("concise-home-");
  const user = planEdit({ cwd: codex, env: { HOME: home }, layer: "user", edits: edit });
  check("user picks ~/.config/concise when no user file exists", user.layer.path === join(home, ".config", "concise", "concise.json"), user.layer);
  for (const [name, layer, env, pattern] of [["user without HOME", "user", {}, /No user layer/], ["an unknown layer", "bogus", {}, /Unknown layer bogus/]]) {
    try {
      planEdit({ cwd: codex, env, layer, edits: edit });
      bad(`${name} is refused`, "no error");
    } catch (error) {
      check(`${name} is refused`, pattern.test(error.message), error.message);
    }
  }
}

console.log("\nsettings tools: show, validate, keys");

{
  const dir = project({ features: { emDash: { mode: "off" } } });
  const invalid = cli(["validate", "--cwd", dir]);
  check("validate exits 1 on an invalid layer file", invalid.code === 1 && invalid.out.includes("error project-claude") && invalid.out.includes("Invalid."), invalid);
  writeFileSync(layerFile(dir), "{");
  check("validate reports a JSON syntax error", cli(["validate", "--cwd", dir]).out.includes("is not valid JSON"), dir);
  writeFileSync(layerFile(dir), "{}");
  const valid = cli(["validate", "--cwd", dir]);
  check("validate exits 0 when every file is valid", valid.code === 0 && valid.out.includes("Valid."), valid);
  const shown = JSON.parse(cli(["show", "--cwd", dir, "--json"]).out);
  check("show marks the project file in effect", shown.layers.find((layer) => layer.id === "project-claude")?.active === true, shown.layers);
  check("show lists problems apart from the settings", Array.isArray(shown.problems) && !("problems" in shown.effective), Object.keys(shown));
}

check("keys reads the docs table", settingKeys("emDash.mode").some((row) => row.key === "features.emDash.mode" && row.default === "\"confirm\""), settingKeys("emDash.mode"));
check("keys lists the dictionary keys", ["enabled", "mode", "entries"].every((key) => settingKeys("dictionary").some((row) => row.key === `features.dictionary.${key}`)), settingKeys("dictionary"));
check("help exits 0", cli(["--help"]).out.startsWith("Usage: concise-config"), cli(["--help"]));
check("an unknown command exits 2", cli(["frobnicate"]).code === 2, cli(["frobnicate"]));
check("lineDiff marks changed lines with context", lineDiff("a\nb\nc\n", "a\nB\nc\n") === "  a\n- b\n+ B\n  c", lineDiff("a\nb\nc\n", "a\nB\nc\n"));
{
  const merged = mergeDelta({ features: { aiWriting: { disablePatterns: ["x"], preset: "ste" } } }, { features: { aiWriting: { disablePatterns: ["x", "y"], preset: "ryan" } } });
  check("mergeDelta unions lists and replaces values", show(merged) === show({ features: { aiWriting: { disablePatterns: ["x", "y"], preset: "ryan" } } }), merged);
}

console.log("\nsettings tools: dictionary and check");

{
  const dir = project({});
  const file = layerFile(dir);
  const home = tempDir("concise-home-");
  mkdirSync(join(home, ".config", "concise"), { recursive: true });
  const leverage = { id: "leverage", match: "exact", value: "leverage", fix: "use" };
  writeFileSync(join(home, ".config", "concise", "concise.json"), JSON.stringify({ features: { dictionary: { entries: [leverage] } } }));
  const env = { HOME: home };
  const add = ["dict", "add", "--value", "synerg", "--match", "startsWith", "--fix", "name the shared part", "--hooks", "stop,subagentStop", "--cwd", dir];
  cli([...add, "--apply"], { env });
  const entry = readJson(file).features.dictionary.entries[0];
  check("dict add writes a normalized entry", show(entry) === show({ id: "synerg", match: "startsWith", value: "synerg", fix: "name the shared part", hooks: ["stop", "subagentStop"] }), entry);
  const duplicate = cli(add, { env });
  check("dict add refuses an existing id without --replace", duplicate.code === 2 && duplicate.err.includes("already in this layer"), duplicate);
  const listed = JSON.parse(cli(["dict", "list", "--cwd", dir, "--json"], { env }).out);
  check("dict list names the layer of each entry", show(listed.entries.map((item) => [item.id, item.layer])) === show([["leverage", "user"], ["synerg", "project-claude"]]), listed);
  const text = cli(["dict", "list", "--cwd", dir], { env }).out;
  check("dict list prints one line per entry", text.includes("synerg: startsWith on word \"synerg\" -> name the shared part [hooks stop,subagentStop] from project-claude"), text);
  const elsewhere = cli(["dict", "remove", "leverage", "--cwd", dir], { env });
  check("dict remove names the layer that owns the entry", elsewhere.code === 2 && elsewhere.err.includes("It comes from user; pass disable"), elsewhere);
  cli(["dict", "remove", "leverage", "--disable", "--cwd", dir, "--apply"], { env });
  check("dict remove --disable switches the entry off from this layer", cli(["dict", "list", "--cwd", dir], { env }).out.includes("from project-claude (off)"), readJson(file));
  cli(["dict", "remove", "synerg", "--cwd", dir, "--apply"], { env });
  check("dict remove drops the entry from the layer", show(readJson(file).features.dictionary.entries) === show([{ id: "leverage", enabled: false }]), readJson(file));
  const tested = cli(["dict", "test", "Synergies abound", "--value", "synerg", "--match", "startsWith"]);
  check("dict test prints the matches", tested.out.trim() === "line 1: \"Synergies\"", tested);
  const broken = cli(["dict", "add", "--value", "(", "--match", "regex", "--fix", "f", "--cwd", dir]);
  check("dict add rejects a regex that does not compile", broken.code === 2 && broken.err.includes("does not compile"), broken);
}

{
  const wip = { id: "wip", match: "exact", value: "WIP", fix: "finish the change first", scopes: ["commit"] };
  const dir = project({ features: { dictionary: { entries: [wip] }, emDash: { enabled: true, replies: false } } });
  const found = cli(["check", "--scope", "commit", "--cwd", dir, "WIP parser"]);
  check("check exits 1 with the finding", found.code === 1 && found.out.includes("[concise:dictionary:wip]"), found);
  const clean = cli(["check", "--scope", "gh", "--cwd", dir, "WIP parser"]);
  check("check exits 0 when the scope skips the entry", clean.code === 0 && clean.out.trim() === "Clean.", clean);
  check("check reads stdin", cli(["check", "--scope", "commit", "--cwd", dir], { input: "WIP again" }).code === 1, dir);
  check("check skips reply dashes when replies is false", cli(["check", "--cwd", dir, "a — b"]).code === 0, dir);
  check("check flags file dashes", cli(["check", "--scope", "files", "--cwd", dir, "a — b"]).code === 1, dir);
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
