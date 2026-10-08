import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addPack, checkUpdates, packSources, packTargets, removePack, togglePack, updatePack } from "../plugins/concise/web/packs.mjs";

const VERSION = JSON.parse(await readFile(new URL("../plugins/concise/.claude-plugin/plugin.json", import.meta.url), "utf8")).version;
const pack = (id) => ({ id, feature: "aiWriting", category: id, patterns: [{ phrase: "frobnicate", fix: "say what it does" }] });

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "concise-packs-cov-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "project");
  const home = join(root, "home");
  await mkdir(cwd);
  await mkdir(home);
  const projectLock = join(cwd, ".claude", "concise", "packs.json");
  const writeJson = async (path, value) => {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
  };
  return { root, cwd, home, env: { HOME: home }, projectLock, writeJson };
}

async function remote(t, routes) {
  const server = createServer((req, response) => {
    const body = routes[req.url];
    if (body === undefined) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": "application/json" }).end(typeof body === "string" ? body : JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

const rejects = (promise, status, message) => assert.rejects(promise, (err) => err.status === status && message.test(err.message));

test("pack targets fall back to the project without a user home", async (t) => {
  const { cwd } = await fixture(t);
  assert.deepEqual(packTargets(cwd, {}).map((target) => target.id), ["project"]);
});

test("pack sources ignore non-object locks and default missing timestamps", async (t) => {
  const { cwd, home, env, projectLock, writeJson } = await fixture(t);
  await writeJson(projectLock, "[1]");
  await writeJson(join(home, ".config", "concise", "packs.json"), { team: { url: "https://packs.example.test/team.json" } });
  assert.deepEqual(packSources(cwd, env), { team: { url: "https://packs.example.test/team.json", updatedAt: null, target: "user" } });
});

test("pack fetch failures map to 502 and 413 problems", async (t) => {
  const { cwd, env } = await fixture(t);
  const big = 3 * 1024 * 1024;
  const replies = [
    () => Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: new Error("connect ECONNREFUSED") })),
    () => Promise.reject(new Error("offline")),
    () => Promise.resolve(new Response("{}", { headers: { "content-length": String(big) } })),
    () => Promise.resolve(new Response("x".repeat(big))),
  ];
  t.mock.method(globalThis, "fetch", () => replies.shift()());
  const add = () => addPack({ cwd, env, source: "https://packs.example.test/team.json" });
  await rejects(add(), 502, /team\.json could not be fetched: connect ECONNREFUSED$/);
  await rejects(add(), 502, /team\.json could not be fetched: offline$/);
  await rejects(add(), 413, /team\.json exceeds 2 MiB$/);
  await rejects(add(), 413, /team\.json exceeds 2 MiB$/);
});

test("pasted packs refuse an id that a scripted pack already uses", async (t) => {
  const { cwd, env } = await fixture(t);
  const dir = join(cwd, ".claude", "concise", "patterns");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "team-words.mjs"), "export default {};\n");
  await rejects(addPack({ cwd, env, text: JSON.stringify(pack("team-words")) }), 409, /team-words\.mjs already exists in /);
});

test("URL installs keep the served text and updates refuse a changed pack id", async (t) => {
  const { cwd, env } = await fixture(t);
  const routes = { "/team.json": `${JSON.stringify(pack("team-words"))}\n` };
  const url = await remote(t, routes);
  const installed = await addPack({ cwd, env, source: `${url}/team.json` });
  assert.equal(await readFile(installed.path, "utf8"), routes["/team.json"]);
  routes["/team.json"] = pack("other-words");
  await rejects(updatePack({ cwd, env, id: "team-words", target: "project" }), 400, /team\.json now holds pack other-words, expected team-words$/);
});

test("updates report invalid lock URLs and compare release versions", async (t) => {
  const { cwd, env, projectLock, writeJson } = await fixture(t);
  await writeJson(projectLock, { bad: { url: "not a url" } });
  const url = await remote(t, { "/equal": { tag_name: `v${VERSION}`, html_url: "https://example.test/release" }, "/empty": {} });
  let report = await checkUpdates({ cwd, env, releasesUrl: `${url}/equal` });
  assert.deepEqual(report.plugin, { version: VERSION, latest: VERSION, url: "https://example.test/release", updateAvailable: false, error: null });
  assert.equal(report.packs.length, 1);
  assert.equal(report.packs[0].updatedAt, null);
  assert.equal(report.packs[0].error, "URL must use https, or http on localhost");
  report = await checkUpdates({ cwd, env, releasesUrl: `${url}/empty` });
  assert.equal(report.plugin.latest, null);
  assert.equal(report.plugin.url, null);
  report = await checkUpdates({ cwd, env, releasesUrl: `${url}/missing` });
  assert.match(report.plugin.error, /missing returned 404$/);
  await rejects(updatePack({ cwd, env, id: "bad", target: "project" }), 400, /^URL must use https, or http on localhost$/);
  await rejects(updatePack({ cwd, env, id: "bad", target: "elsewhere" }), 400, /^Unknown pack target$/);
});

test("path sources resolve against the project and must be packs", async (t) => {
  const { cwd, env } = await fixture(t);
  await mkdir(join(cwd, "local-packs"));
  await writeFile(join(cwd, "notes.txt"), "notes");
  assert.deepEqual(await addPack({ cwd, env, source: "local-packs" }), { path: join(cwd, "local-packs"), layer: "project-claude" });
  assert.deepEqual(JSON.parse(await readFile(join(cwd, ".claude", "concise.json"), "utf8")).features.aiWriting.packs, ["local-packs"]);
  await rejects(addPack({ cwd, env, source: "notes.txt" }), 400, /must be a \.json or \.mjs file or a directory/);
});

test("layer edits refuse invalid project layers and ignore BEC_CONFIG_PATH", async (t) => {
  const { cwd, env, writeJson } = await fixture(t);
  await mkdir(join(cwd, "local-packs"));
  const layerPath = join(cwd, ".claude", "concise.json");
  const add = (extra = {}) => addPack({ cwd, env: { ...env, ...extra }, source: "local-packs" });
  await writeJson(layerPath, "{");
  await rejects(add(), 400, /concise\.json is not valid JSON: /);
  await writeJson(layerPath, "[]");
  await rejects(add(), 400, /concise\.json is not a JSON object$/);
  await rm(layerPath);
  for (const pinned of ["pinned.json", ".claude/concise.json"]) {
    assert.deepEqual(await add({ BEC_CONFIG_PATH: pinned }), { path: join(cwd, "local-packs"), layer: "project-claude" });
    assert.deepEqual(JSON.parse(await readFile(layerPath, "utf8")).features.aiWriting.packs, ["local-packs"]);
    await rm(layerPath);
  }
  assert.equal(existsSync(join(cwd, "pinned.json")), false);
});

test("remove and toggle validate their inputs", async (t) => {
  const { cwd, env } = await fixture(t);
  const catalog = async () => ({ packs: [{ id: "team-words", feature: "aiWriting", categoryId: "team-words", active: true }] });
  await rejects(removePack({ cwd, env, id: 5, catalog }), 400, /^id is required$/);
  await rejects(removePack({ cwd, env, id: "missing", catalog }), 404, /^Unknown pack missing$/);
  await rejects(togglePack({ cwd, env, id: "team-words", catalog }), 400, /^id and enabled are required$/);
  await rejects(togglePack({ cwd, env, id: "team-words", enabled: true, target: "elsewhere", catalog }), 400, /^Unknown pack target$/);
});

test("emDash toggles write the feature flag and explain a pack that stays active", async (t) => {
  const { cwd, env } = await fixture(t);
  const catalog = async () => ({ packs: [{ id: "em-dash", feature: "emDash", active: true }] });
  const layer = async () => JSON.parse(await readFile(join(cwd, ".claude", "concise.json"), "utf8"));
  let result = await togglePack({ cwd, env, id: "em-dash", enabled: true, catalog });
  assert.equal(result.warning, null);
  assert.deepEqual(await layer(), { features: { emDash: { enabled: true } } });
  result = await togglePack({ cwd, env, id: "em-dash", enabled: false, catalog });
  assert.deepEqual(await layer(), { features: { emDash: { enabled: false } } });
  assert.equal(result.active, true);
  assert.equal(result.warning, "em-dash is still active after saving. Check the other configuration layers and the BEC_ environment overrides.");
});
