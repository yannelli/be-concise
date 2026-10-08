import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { startServer } from "../plugins/concise/web/server.mjs";
import { monitorPath } from "../plugins/concise/hooks/lib/monitor.mjs";
import { projectKey, registerProject } from "../plugins/concise/hooks/lib/projects.mjs";

const LIMIT = 2 * 1024 * 1024;

async function workspace(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "concise-web-cov-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "project");
  const home = join(root, "home");
  await mkdir(cwd);
  await mkdir(home);
  return { root, cwd, home, env: { PATH: process.env.PATH, HOME: home, XDG_CACHE_HOME: join(root, "cache") } };
}

async function launch(t, space, options = {}) {
  const server = await startServer({ cwd: space.cwd, env: space.env, ...options });
  t.after(() => server.close());
  const api = (path, init = {}) => fetch(`${server.url}${path}`, {
    ...init, headers: { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json", ...init.headers },
  });
  const ingest = (record) => api("/api/ingest", { method: "POST", body: JSON.stringify(record) });
  return { ...server, api, ingest };
}

async function fixture(t, overrides = {}, options = {}) {
  const space = await workspace(t);
  Object.assign(space.env, overrides);
  return { ...space, ...(await launch(t, space, options)) };
}

async function until(check) {
  for (let i = 0; i < 400; i += 1) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("condition not met");
}

test("static routes reject other methods, invalid names, and missing assets", async (t) => {
  const app = await fixture(t);
  const posted = await fetch(app.url, { method: "POST" });
  assert.equal(posted.status, 405);
  assert.deepEqual(await posted.json(), { error: "Method not allowed" });
  assert.equal((await fetch(`${app.url}/Upper.txt`)).status, 404);
  assert.equal((await fetch(`${app.url}/missing.html`)).status, 404);
  const font = await fetch(`${app.url}/geist.woff2`);
  assert.equal(font.status, 200);
  assert.equal(font.headers.get("content-type"), "font/woff2");
  assert.deepEqual(Buffer.from(await font.arrayBuffer()), await readFile(new URL("../plugins/concise/assets/geist.woff2", import.meta.url)));
});

test("ingest rejects oversized, malformed, and foreign records", async (t) => {
  const app = await fixture(t);
  const status = async (body) => {
    const response = await app.api("/api/ingest", { method: "POST", body });
    return [response.status, (await response.json()).error];
  };
  assert.deepEqual(await status("x".repeat(LIMIT + 1)), [413, "Request exceeds 2 MiB"]);
  assert.deepEqual(await status(""), [400, "Invalid hook record"]);
  assert.deepEqual(await status("{"), [400, "Invalid JSON request"]);
  const record = { hook: "check-edit", request: {}, response: {} };
  assert.deepEqual(await status(JSON.stringify({ ...record, cwd: app.root })), [400, "Hook belongs to another project"]);
  const [code, error] = await status(JSON.stringify({ ...record, cwd: join(app.root, "missing") }));
  assert.equal(code, 500);
  assert.match(error, /ENOENT/);
  const base = Buffer.byteLength(JSON.stringify({ ...record, cwd: app.cwd, request: { pad: "" } }));
  const large = { ...record, cwd: app.cwd, request: { pad: "x".repeat(LIMIT - 10 - base) } };
  assert.equal((await app.ingest(large)).status, 200);
  assert.deepEqual((await (await app.api("/api/history")).json()).records, []);
});

test("history keeps the newest 500 records", async (t) => {
  const app = await fixture(t);
  for (let start = 0; start < 501; start += 50) {
    const batch = Array.from({ length: Math.min(50, 501 - start) }, (_, i) => start + i);
    const results = await Promise.all(batch.map((i) => app.ingest({ cwd: app.cwd, hook: `r${i}`, request: {}, response: {} })));
    assert.ok(results.every((response) => response.status === 200));
  }
  const { records } = await (await app.api("/api/history")).json();
  assert.equal(records.length, 500);
  assert.equal(records[0].hook, "r1");
  assert.equal(records.at(-1).hook, "r500");
});

test("a stalled event stream is ended once its buffer fills", async (t) => {
  const app = await fixture(t);
  const response = await new Promise((resolve, reject) => {
    const req = request(`${app.url}/api/events?token=${app.token}`, resolve);
    req.on("error", reject);
    req.end();
  });
  assert.equal(response.statusCode, 200);
  const ended = new Promise((resolve) => response.on("end", resolve));
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await app.ingest({ cwd: app.cwd, hook: `big${i}`, request: { pad: "x".repeat(1024 * 1024) }, response: {} })).status, 200);
  }
  let text = "";
  response.on("data", (chunk) => { text += chunk; });
  await ended;
  assert.match(text, /event: ready/);
  assert.equal((await (await app.api("/api/history")).json()).records.length, 3);
});

test("BEC_CONFIG_PATH resolves against the project directory", async (t) => {
  const app = await fixture(t, { BEC_CONFIG_PATH: "custom.json" });
  const state = await (await app.api("/api/state")).json();
  assert.equal(state.environment.BEC_CONFIG_PATH, join(app.cwd, "custom.json"));
  assert.equal(state.layers.find((layer) => layer.id === "env-config").path, join(app.cwd, "custom.json"));
});

test("playground input must be an object and defaults to the saved settings", async (t) => {
  const app = await fixture(t);
  const rejected = await app.api("/api/test", { method: "POST", body: "[]" });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), { error: "Test must be an object" });
  await mkdir(join(app.cwd, ".claude"));
  await writeFile(join(app.cwd, ".claude", "concise.json"), '{"maxCommentLines":6}');
  const response = await app.api("/api/test", { method: "POST", body: JSON.stringify({ kind: "Write", path: "notes.md", text: "plain text" }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.config.maxCommentLines, 6);
  assert.ok(result.hooks.length > 0);
});

test("console refuses a fifth concurrent operation", async (t) => {
  const pending = [];
  const release = createServer((req, response) => pending.push(response));
  await new Promise((resolve) => release.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { release.closeAllConnections(); release.close(resolve); }));
  const app = await fixture(t, {}, { releasesUrl: `http://127.0.0.1:${release.address().port}/release` });
  const running = Array.from({ length: 4 }, () => app.api("/api/packs/updates"));
  await until(() => pending.length === 4);
  const busy = await app.api("/api/state");
  assert.equal(busy.status, 429);
  assert.match((await busy.json()).error, /Console is busy/);
  for (const response of pending) response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
  for (const response of await Promise.all(running)) {
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.plugin.latest, null);
    assert.equal(report.plugin.url, null);
    assert.equal(report.plugin.updateAvailable, false);
  }
});

test("registration replaces dead and malformed registries", async (t) => {
  for (const stale of [JSON.stringify({ url: "http://127.0.0.1:1", token: "old", pid: 2 ** 30 }), "{"]) {
    const space = await workspace(t);
    const path = monitorPath(space.cwd, space.env);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, stale);
    const app = await launch(t, space);
    assert.equal(app.registryPath, path);
    assert.equal(JSON.parse(await readFile(path, "utf8")).token, app.token);
  }
});

test("hub without projects reports no project until one registers", async (t) => {
  const space = await workspace(t);
  const app = await launch(t, space, { all: true });
  let state = await (await app.api("/api/state")).json();
  assert.equal(state.hub, true);
  assert.equal(state.cwd, null);
  assert.deepEqual(state.projects, []);
  const refused = await app.api("/api/config", { method: "PATCH", body: "{}" });
  assert.equal(refused.status, 404);
  assert.match((await refused.json()).error, /No project is registered yet/);
  registerProject(space.cwd, space.env);
  const { key } = projectKey(space.cwd);
  await until(async () => (await (await app.api("/api/projects")).json()).projects.length === 1);
  state = await (await app.api("/api/state")).json();
  assert.equal(state.project, key);
  assert.equal(state.cwd, space.cwd);
  assert.equal((await app.api("/api/clear", { method: "POST", body: "{}" })).status, 200);
});

test("hub opens the newest existing project and refuses writes to deleted directories", async (t) => {
  const space = await workspace(t);
  const gone = join(space.root, "gone");
  await mkdir(gone);
  registerProject(space.cwd, space.env, Date.now() - 1000);
  registerProject(gone, space.env);
  await rm(gone, { recursive: true });
  const app = await launch(t, space, { all: true });
  const state = await (await app.api("/api/state")).json();
  assert.equal(state.cwd, space.cwd);
  assert.deepEqual(state.projects.map(({ name, missing }) => [name, missing]), [["gone", true], ["project", false]]);
  const goneKey = projectKey(gone).key;
  assert.equal((await app.api(`/api/state?project=${goneKey}`)).status, 200);
  const refused = await app.api(`/api/config?project=${goneKey}`, { method: "PATCH", body: "{}" });
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, /no longer exists/);
  assert.equal(existsSync(gone), false);
});
