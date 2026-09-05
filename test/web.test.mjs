import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { startServer } from "../plugins/concise/web/server.mjs";
import { validateConfig } from "../plugins/concise/web/configuration.mjs";
import { publishMonitor } from "../plugins/concise/hooks/lib/monitor.mjs";

async function fixture(t, overrides = {}, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "concise-web-test-"));
  const cwd = join(root, "project");
  const home = join(root, "home");
  await mkdir(cwd);
  await mkdir(home);
  const env = { PATH: process.env.PATH, HOME: home, XDG_CACHE_HOME: join(root, "cache"), ...overrides };
  const server = await startServer({ cwd, env, ...options });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const api = (path, options = {}) => fetch(`${server.url}${path}`, {
    ...options, headers: { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json", ...options.headers },
  });
  return { ...server, root, home, env, api };
}

test("console authenticates APIs and rejects cross-origin requests", async (t) => {
  const app = await fixture(t);
  assert.equal(app.browserUrl, app.url);
  assert.deepEqual(app.networkUrls, []);
  assert.equal((await fetch(`${app.url}/api/history`)).status, 401);
  assert.equal((await app.api("/api/history", { headers: { Origin: "https://example.com" } })).status, 403);
  const invalidHost = await new Promise((resolve, reject) => {
    const req = request(`${app.url}/api/history`, { headers: { Host: "example.com" } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(invalidHost, 403);
  assert.equal((await app.api("/api/history")).status, 200);
  const page = await fetch(app.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const icon = await fetch(`${app.url}/icon.svg`);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get("content-type"), /^image\/svg\+xml/);
  assert.equal(await icon.text(), await readFile(new URL("../plugins/concise/assets/icon.svg", import.meta.url), "utf8"));
  const darkIcon = await fetch(`${app.url}/icon-dark.svg`);
  assert.equal(darkIcon.status, 200);
  const darkSvg = await darkIcon.text();
  assert.match(darkSvg, /fill="#FAF7F2"/);
  assert.match(darkSvg, /fill="#FF4A24"/);
  assert.doesNotMatch(darkSvg, /fill="#18191D"/);
  assert.equal((await app.api("/api/configuration.mjs")).status, 404);
});

test("Paseo proxy accepts its configured origin and preserves authentication", async (t) => {
  const origin = "http://web--concise.localhost:6767";
  const app = await fixture(t, { PASEO_URL: origin });
  const proxy = (path, headers = {}) => new Promise((resolve, reject) => {
    const req = request(`${app.url}${path}`, { headers: { Host: new URL(origin).host, ...headers } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  const authorized = { Authorization: `Bearer ${app.token}`, Origin: origin };
  assert.equal(app.browserUrl, origin);
  assert.equal(JSON.parse(await readFile(app.registryPath, "utf8")).url, app.url);
  assert.equal(await proxy("/"), 200);
  assert.equal(await proxy("/api/history"), 401);
  assert.equal(await proxy("/api/history", { Authorization: "Bearer invalid" }), 401);
  assert.equal(await proxy("/api/history", authorized), 200);
  assert.equal(await proxy("/api/history", { ...authorized, Origin: "https://example.com" }), 403);
  assert.equal(await proxy("/api/history", { ...authorized, Host: "example.com" }), 403);
  assert.equal(await proxy("/api/history", { ...authorized, Host: "web--concise.localhost:6768" }), 403);
  assert.equal(await proxy("/api/history", { ...authorized, Origin: app.url }), 403);
  assert.equal((await app.api("/api/history", { headers: { Origin: app.url } })).status, 200);
});

test("remote console serves network addresses with token and origin checks", async (t) => {
  const app = await fixture(t, { PATH: "" }, { remote: true });
  assert.equal(JSON.parse(await readFile(app.registryPath, "utf8")).url, app.url);
  const aliasStatus = await new Promise((resolve, reject) => {
    const target = app.url.replace("127.0.0.1", "127.0.0.2");
    const req = request(target, { headers: { Host: new URL(app.url).host } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(aliasStatus, 200);
  for (const url of app.networkUrls) {
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(`${url}/api/history`)).status, 401);
    const headers = { Authorization: `Bearer ${app.token}`, Origin: url };
    assert.equal((await fetch(`${url}/api/history`, { headers })).status, 200);
    headers.Origin = "https://example.com";
    assert.equal((await fetch(`${url}/api/history`, { headers })).status, 403);
  }
  const record = { cwd: app.cwd, hook: "remote-test", request: {}, response: {} };
  await publishMonitor(record, { env: app.env });
  assert.equal((await (await app.api("/api/history")).json()).records.length, 1);
});

test("remote console accepts this node's full and short Tailscale hostnames", async (t) => {
  const bin = await mkdtemp(join(tmpdir(), "concise-tailscale-test-"));
  t.after(() => rm(bin, { recursive: true, force: true }));
  const status = { Self: { DNSName: "console.example.ts.net." }, Peer: { other: { DNSName: "other.example.ts.net." } } };
  await writeFile(join(bin, "tailscale"), `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify(status))});\n`, { mode: 0o755 });
  const app = await fixture(t, { PATH: bin }, { remote: true });
  const port = new URL(app.url).port;
  const responseStatus = (host, headers = {}) => new Promise((resolve, reject) => {
    const req = request(`${app.url}/api/history`, { headers: { Host: `${host}:${port}`, ...headers } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  for (const host of ["console.example.ts.net", "console"]) {
    const origin = `http://${host}:${port}`;
    assert.ok(app.networkUrls.includes(origin));
    assert.equal(await responseStatus(host), 401);
    const headers = { Authorization: `Bearer ${app.token}`, Origin: origin };
    assert.equal(await responseStatus(host, headers), 200);
    assert.equal(await responseStatus(host, { ...headers, Origin: "https://example.com" }), 403);
    assert.equal(await responseStatus(host, { ...headers, Host: `${host}:${Number(port) + 1}` }), 403);
  }
  assert.equal(await responseStatus("other.example.ts.net", { Authorization: `Bearer ${app.token}` }), 403);
  const local = await fixture(t, { PATH: bin });
  assert.deepEqual(local.networkUrls, []);
});

test("config edits preserve layers and detect stale writes", async (t) => {
  const app = await fixture(t);
  await mkdir(join(app.home, ".config", "concise"), { recursive: true });
  await writeFile(join(app.home, ".config", "concise", "concise.json"), '{"maxCommentLines":4}');
  let state = await (await app.api("/api/state")).json();
  assert.equal(state.effective.maxCommentLines, 4);
  assert.ok(state.packs.length > 40);
  assert.ok(state.presets.technical);
  const project = state.layers.find((layer) => layer.id === "project-codex");
  assert.equal(project.exists, false);
  const payload = { id: project.id, revision: null, text: '{"maxCommentLines":7,"features":{"aiWriting":{"enabled":true}}}' };
  let result = await app.api("/api/config", { method: "PATCH", body: JSON.stringify(payload) });
  assert.equal(result.status, 200);
  state = await result.json();
  assert.equal(state.effective.maxCommentLines, 7);
  assert.equal(state.effective.features.aiWriting.enabled, true);
  assert.equal(state.layers.find((layer) => layer.id === project.id).active, true);
  result = await app.api("/api/config", { method: "PATCH", body: JSON.stringify(payload) });
  assert.equal(result.status, 409);
  assert.equal(JSON.parse(await readFile(project.path, "utf8")).maxCommentLines, 7);
  payload.revision = state.layers.find((layer) => layer.id === project.id).revision;
  for (const text of ['{"features":{"aiWriting":false}}', '[]', '{"__proto__":{}}', '{"maxFileLines":-2}', '{"checks":{"comments":"false"}}']) {
    result = await app.api("/api/config", { method: "PATCH", body: JSON.stringify({ ...payload, text }) });
    assert.equal(result.status, 400, text);
  }
  assert.equal(JSON.parse(await readFile(project.path, "utf8")).maxCommentLines, 7);
});

test("test filter settings can be saved without evaluating shell content", async (t) => {
  const app = await fixture(t);
  const update = (text, revision = null) => app.api("/api/config", {
    method: "PATCH", body: JSON.stringify({ id: "filter-claude", revision, text }),
  });
  assert.equal((await update("FILTER_LINES=$(touch /tmp/concise-web-unexpected)" )).status, 400);
  const result = await update("FILTER_LINES=20\nFILTER_PATTERN='^FAIL|Error:'\n");
  assert.equal(result.status, 200);
  assert.match(await readFile(join(app.home, ".claude", "test-filter.conf"), "utf8"), /FILTER_LINES=20/);
});

test("live records stream with full responses and history can be cleared", async (t) => {
  const app = await fixture(t);
  const abort = new AbortController();
  t.after(() => abort.abort());
  const response = await fetch(`${app.url}/api/events?token=${app.token}`, { signal: abort.signal });
  const reader = response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: ready/);
  const record = { cwd: app.cwd, hook: "check-edit", decision: "deny", request: { tool_name: "Write", tool_input: { content: "private fixture text" } }, response: { hookSpecificOutput: { permissionDecision: "deny" } } };
  await publishMonitor(record, { env: app.env });
  const event = new TextDecoder().decode((await reader.read()).value);
  assert.match(event, /event: record/);
  assert.match(event, /private fixture text/);
  const history = await (await app.api("/api/history")).json();
  assert.equal(history.records.length, 1);
  assert.equal(history.records[0].source, "live");
  assert.deepEqual(history.records[0].response, record.response);
  assert.equal((await app.api("/api/clear", { method: "POST", body: "{}" })).status, 200);
  assert.equal((await (await app.api("/api/history")).json()).records.length, 0);
  abort.abort();
});

test("playground previews settings without saving and emits test records", async (t) => {
  const app = await fixture(t);
  const response = await app.api("/api/test", { method: "POST", body: JSON.stringify({
    kind: "Write", path: "example.md", text: "We delve into the parser.",
    config: { features: { aiWriting: { enabled: true } } },
  }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.hooks[0].response.hookSpecificOutput.permissionDecision, "deny");
  assert.ok(result.matches.some((match) => match.category === "vocabulary"));
  const history = await (await app.api("/api/history")).json();
  assert.equal(history.records[0].source, "test");
  const state = await (await app.api("/api/state")).json();
  assert.equal(state.effective.features.aiWriting.enabled, false);
});

test("one console per project preserves the first registry", async (t) => {
  const app = await fixture(t);
  await assert.rejects(startServer({ cwd: app.cwd, env: app.env }), /already registered/);
  assert.equal(JSON.parse(await readFile(app.registryPath, "utf8")).token, app.token);
});

test("validation supports nullable categories, sizes, and custom pack thresholds", () => {
  assert.doesNotThrow(() => validateConfig({ features: { aiWriting: { categories: null, options: { custom: { minimum: 2 } } } }, log: { maxSize: 1024 } }));
  assert.throws(() => validateConfig({ bypass: { patterns: ["["] } }), /Invalid regex/);
  assert.throws(() => validateConfig({ features: { emDash: { mode: "off" } } }), /must be confirm/);
});
