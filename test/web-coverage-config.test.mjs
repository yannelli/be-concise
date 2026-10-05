import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuration, saveConfiguration, validateConfig, validateFilter } from "../plugins/concise/web/configuration.mjs";

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "concise-config-cov-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "project");
  await mkdir(cwd);
  return { root, cwd, env: { HOME: join(root, "home") } };
}

test("validation rejects malformed values for each typed setting", () => {
  const cases = [
    [{ features: { aiWriting: { options: [] } } }, /features\.aiWriting\.options must map pack ids to objects/],
    [{ features: { aiWriting: { categories: "vocabulary" } } }, /categories must be null or a string array/],
    [{ log: { path: 5 } }, /log\.path must be null or a path/],
    [{ log: { maxSize: "huge" } }, /log\.maxSize must be a positive size such as 5m/],
    [{ allowList: { patterns: [1] } }, /allowList\.patterns must be a string array/],
    [{ maxRetries: -1 }, /maxRetries must be an integer of at least 0/],
    [{ log: { rotate: "weekly" } }, /log\.rotate must be none, size, daily, or both/],
    [{ log: { format: "xml" } }, /log\.format must be json or plaintext/],
  ];
  for (const [config, message] of cases) assert.throws(() => validateConfig(config), (err) => err.status === 400 && message.test(err.message));
  const valid = { features: { aiWriting: { categories: ["vocabulary"] } }, log: { path: "/tmp/concise.log", rotate: "daily", format: "plaintext" }, maxRetries: 0 };
  assert.equal(validateConfig(valid), valid);
  assert.doesNotThrow(() => validateConfig({ log: { path: null } }));
});

test("configuration lists XDG and override layers and hides token variables", async (t) => {
  const { root, cwd, env } = await fixture(t);
  const xdg = join(root, "xdg");
  const state = configuration(cwd, { ...env, XDG_CONFIG_HOME: xdg, BEC_CONFIG_PATH: "custom.json", BEC_MONITOR_TOKEN: "secret", BEC_SOFT_FAIL: "0" });
  const layer = (id) => state.layers.find((item) => item.id === id);
  assert.equal(layer("user-xdg").path, join(xdg, "concise", "concise.json"));
  assert.equal(layer("project-override").path, join(cwd, "custom.json"));
  assert.equal(layer("project-override").active, true);
  assert.deepEqual(state.environment, { BEC_CONFIG_PATH: "custom.json", BEC_SOFT_FAIL: "0" });
});

test("unreadable layers report their error and refuse saves", async (t) => {
  const { cwd, env } = await fixture(t);
  await mkdir(join(cwd, ".claude", "concise.json"), { recursive: true });
  const layer = configuration(cwd, env).layers.find((item) => item.id === "project-claude");
  assert.equal(layer.exists, true);
  assert.match(layer.error, /EISDIR/);
  assert.throws(() => saveConfiguration(cwd, env, { id: layer.id, text: "{}", revision: layer.revision }), (err) => err.status === 400 && /EISDIR/.test(err.message));
});

test("saves validate the layer id, text type, and JSON", async (t) => {
  const { cwd, env } = await fixture(t);
  const save = (input) => () => saveConfiguration(cwd, env, { revision: null, ...input });
  assert.throws(save({ id: "elsewhere", text: "{}" }), /Unknown configuration layer/);
  assert.throws(save({ id: "project-codex", text: 5 }), /text must be a string/);
  assert.throws(save({ id: "project-codex", text: "{" }), /^Error: Invalid JSON: /);
  assert.equal(configuration(cwd, env).layers.find((item) => item.id === "project-codex").exists, false);
});

test("filter config rejects unknown lines, unquoted patterns, and bad NOFILTER values", () => {
  assert.throws(() => validateFilter("rm -rf /"), /accepts one FILTER_\* or NOFILTER assignment per line/);
  assert.throws(() => validateFilter("FILTER_PATTERN=FAIL"), /FILTER_PATTERN must use single quotes/);
  assert.throws(() => validateFilter("NOFILTER=2"), /NOFILTER must be 0 or 1/);
  assert.doesNotThrow(() => validateFilter("# comment\n\nNOFILTER=1\nFILTER_TAIL=5\n"));
});
