import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request } from "node:http";
import { startServer } from "../plugins/concise/web/server.mjs";
import { validateConfig } from "../plugins/concise/web/configuration.mjs";
import { publishMonitor } from "../plugins/concise/hooks/lib/monitor.mjs";
import { projectKey, recordsPath } from "../plugins/concise/hooks/lib/projects.mjs";
import { loadPacks } from "../plugins/concise/hooks/lib/packs.mjs";

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

test("hub console lists registered projects and follows their record files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "concise-hub-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const alpha = join(root, "alpha");
  const beta = join(root, "beta");
  await Promise.all([home, alpha, beta].map((dir) => mkdir(dir)));
  const env = { PATH: process.env.PATH, HOME: home, XDG_CACHE_HOME: join(root, "cache") };
  const record = (cwd, hook) => ({ cwd, hook, decision: "allow", request: {}, response: {} });
  await publishMonitor(record(alpha, "check-edit"), { env });
  await publishMonitor(record(beta, "check-bash"), { env });
  const server = await startServer({ all: true, env });
  t.after(() => server.close());
  const api = (path, options = {}) => fetch(`${server.url}${path}`, {
    ...options, headers: { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" },
  });
  assert.equal(server.hub, true);
  assert.equal(server.cwd, null);
  assert.equal(server.projectsDir, join(home, ".config", "concise", "projects"));
  const { projects } = await (await api("/api/projects")).json();
  assert.deepEqual(projects.map((project) => project.name).sort(), ["alpha", "beta"]);
  const alphaKey = projects.find((project) => project.name === "alpha").key;
  const history = await (await api("/api/history")).json();
  assert.equal(history.records.length, 2);
  assert.ok(history.records.every((item) => item.project && item.projectName));
  assert.equal((await (await api(`/api/history?project=${alphaKey}`)).json()).records.length, 1);
  assert.equal((await api("/api/ingest", { method: "POST", body: "{}" })).status, 405);
  const abort = new AbortController();
  t.after(() => abort.abort());
  const response = await fetch(`${server.url}/api/events?token=${server.token}`, { signal: abort.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const readUntil = async (needle) => {
    let text = "";
    while (!text.includes(needle)) text += decoder.decode((await reader.read()).value);
    return text;
  };
  await readUntil("check-bash");
  await publishMonitor(record(beta, "check-reply"), { env });
  assert.match(await readUntil("check-reply"), /"projectName":"beta"/);
  const state = await (await api(`/api/state?project=${alphaKey}`)).json();
  assert.equal(state.hub, true);
  assert.equal(state.project, alphaKey);
  assert.equal(state.cwd, projectKey(alpha).cwd);
  assert.equal(state.projects.length, 2);
  assert.equal((await api("/api/state?project=nope")).status, 404);
  const payload = { id: "project-claude", revision: null, text: '{"maxCommentLines":9}' };
  assert.equal((await api(`/api/config?project=${alphaKey}`, { method: "PATCH", body: JSON.stringify(payload) })).status, 200);
  assert.equal(JSON.parse(await readFile(join(alpha, ".claude", "concise.json"), "utf8")).maxCommentLines, 9);
  assert.equal((await api(`/api/clear?project=${alphaKey}`, { method: "POST", body: "{}" })).status, 200);
  const remaining = await (await api("/api/history")).json();
  assert.equal(remaining.records.length, 2);
  assert.ok(remaining.records.every((item) => item.projectName === "beta"));
  assert.equal(await readFile(recordsPath(alpha, env), "utf8"), "");
  await assert.rejects(startServer({ all: true, env }), /already registered/);
});

test("validation supports nullable categories, sizes, and custom pack thresholds", () => {
  assert.doesNotThrow(() => validateConfig({ features: { aiWriting: { categories: null, options: { custom: { minimum: 2 } } } }, log: { maxSize: 1024 } }));
  assert.doesNotThrow(() => validateConfig({ monitor: { persist: false } }));
  assert.throws(() => validateConfig({ monitor: { persist: "no" } }), /must be boolean/);
  assert.throws(() => validateConfig({ bypass: { patterns: ["["] } }), /Invalid regex/);
  assert.throws(() => validateConfig({ features: { emDash: { mode: "off" } } }), /must be confirm/);
});

async function packServer(t, initial) {
  let pack = initial;
  let release = { tag_name: "v0.0.1", html_url: "https://github.com/yannelli/be-concise/releases/tag/v0.0.1" };
  const server = createServer((req, response) => {
    if (req.url === "/release") return response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(release));
    if (req.url === "/team-words.json") return response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(pack));
    if (req.url === "/broken.json") return response.end("{");
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return { url: `http://127.0.0.1:${server.address().port}`, set: (next) => { pack = next; }, setRelease: (next) => { release = next; } };
}

test("console toggles, installs, removes, and updates packs", async (t) => {
  const teamWords = { id: "team-words", feature: "aiWriting", category: { id: "team-words", label: "team words" }, patterns: [{ phrase: "synerg(?:y|ies)", fix: "name the shared part" }] };
  const remote = await packServer(t, teamWords);
  const app = await fixture(t, {}, { releasesUrl: `${remote.url}/release` });
  const post = async (path, body) => {
    const response = await app.api(path, { method: "POST", body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  };
  const updates = async () => (await app.api("/api/packs/updates")).json();
  const packOf = (state, id) => state.packs.find((pack) => pack.id === id);
  const projectConfig = async () => JSON.parse(await readFile(join(app.cwd, ".claude", "concise.json"), "utf8"));

  let result = await post("/api/packs/add", { source: `${remote.url}/team-words.json`, target: "project" });
  assert.equal(result.status, 200, result.error);
  assert.equal(result.path, join(app.cwd, ".claude", "concise", "patterns", "team-words.json"));
  assert.equal(packOf(result.state, "team-words").builtin, false);
  assert.equal(packOf(result.state, "team-words").active, false);
  assert.equal(result.state.packSources["team-words"].target, "project");
  assert.deepEqual(result.state.packTargets.map((target) => target.id), ["project", "user"]);
  assert.equal(JSON.parse(await readFile(join(app.cwd, ".claude", "concise", "packs.json"), "utf8"))["team-words"].url, `${remote.url}/team-words.json`);

  result = await post("/api/packs/toggle", { id: "team-words", enabled: true, target: "project" });
  assert.equal(result.status, 200, result.error);
  assert.equal(result.active, true);
  assert.equal(result.warning, null);
  let config = await projectConfig();
  assert.equal(config.features.aiWriting.enabled, true);
  assert.equal(config.features.aiWriting.enablePatterns, undefined);
  result = await post("/api/packs/toggle", { id: "ste", enabled: true, target: "project" });
  assert.equal(result.active, true);
  assert.deepEqual((await projectConfig()).features.aiWriting.enablePatterns, ["ste"]);
  result = await post("/api/packs/toggle", { id: "ste", enabled: false, target: "project" });
  assert.equal(result.active, false);
  config = await projectConfig();
  assert.deepEqual(config.features.aiWriting.excludePacks, ["ste"]);
  assert.equal(config.features.aiWriting.enablePatterns, undefined);
  result = await post("/api/packs/toggle", { id: "vocabulary", enabled: false, target: "project" });
  assert.equal(packOf(result.state, "vocabulary").active, false);
  result = await post("/api/packs/toggle", { id: "vocabulary", enabled: true, target: "project" });
  assert.equal(packOf(result.state, "vocabulary").active, true);
  config = await projectConfig();
  assert.deepEqual(config.features.aiWriting.excludePacks, ["ste"]);
  assert.equal(config.features.aiWriting.enablePatterns, undefined);
  result = await post("/api/packs/toggle", { id: "em-dash", enabled: true, target: "project" });
  assert.equal(packOf(result.state, "em-dash").active, true);
  assert.equal((await projectConfig()).features.emDash.enabled, true);
  await mkdir(join(app.home, ".config", "concise"), { recursive: true });
  await writeFile(join(app.home, ".config", "concise", "concise.json"), JSON.stringify({ features: { aiWriting: { excludePacks: ["hedging"] } } }));
  result = await post("/api/packs/toggle", { id: "hedging", enabled: true, target: "project" });
  assert.equal(result.active, false);
  assert.match(result.warning, /Check User\./);
  assert.equal((await post("/api/packs/toggle", { id: "missing", enabled: true, target: "project" })).status, 404);

  const custom = { id: "house-words", feature: "aiWriting", category: "house-words", patterns: [{ phrase: "frobnicate", fix: "say what it does" }] };
  result = await post("/api/packs/add", { text: JSON.stringify(custom), target: "user" });
  assert.equal(result.status, 200, result.error);
  assert.equal(result.path, join(app.home, ".config", "concise", "patterns", "house-words.json"));
  assert.equal(packOf(result.state, "house-words").active, true);
  assert.ok((await loadPacks({ cwd: app.cwd, env: app.env })).packs.some((pack) => pack.id === "house-words" && !pack.builtin));
  assert.ok(!(await loadPacks({ cwd: app.cwd })).packs.some((pack) => pack.id === "house-words"));
  assert.equal((await post("/api/packs/add", { text: JSON.stringify(custom), target: "user" })).status, 409);
  const extra = join(app.root, "extra");
  await mkdir(extra);
  await writeFile(join(extra, "extra-words.json"), JSON.stringify({ ...custom, id: "extra-words", category: "extra-words" }));
  result = await post("/api/packs/add", { source: extra, target: "project" });
  assert.equal(result.status, 200, result.error);
  assert.deepEqual((await projectConfig()).features.aiWriting.packs, [extra]);
  assert.equal(packOf(result.state, "extra-words").active, true);
  for (const body of [{ source: "http://example.com/pack.json" }, { source: `${remote.url}/pack.mjs` }, { source: `${remote.url}/broken.json` }, { source: join(app.root, "missing") }, { text: '{"id":"x"}' }, { target: "elsewhere" }, {}]) {
    assert.equal((await post("/api/packs/add", { target: "project", ...body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await post("/api/packs/add", { source: `${remote.url}/missing.json`, target: "project" })).status, 502);

  let report = await updates();
  assert.equal(report.plugin.latest, "0.0.1");
  assert.equal(report.plugin.updateAvailable, false);
  assert.deepEqual(report.packs.map((pack) => [pack.id, pack.target, pack.changed, pack.error]), [["team-words", "project", false, null]]);
  remote.set({ ...teamWords, patterns: [...teamWords.patterns, { phrase: "circle back", fix: "return to" }] });
  remote.setRelease({ tag_name: "v99.0.0", html_url: "https://example.com/release" });
  report = await updates();
  assert.equal(report.plugin.updateAvailable, true);
  assert.equal(report.plugin.url, "https://example.com/release");
  assert.equal(report.packs[0].changed, true);
  result = await post("/api/packs/update", { id: "team-words", target: "project" });
  assert.equal(result.status, 200, result.error);
  assert.equal(JSON.parse(await readFile(result.path, "utf8")).patterns.length, 2);
  assert.equal(packOf(result.state, "team-words").patterns.length, 2);
  assert.equal((await updates()).packs[0].changed, false);
  assert.equal((await post("/api/packs/update", { id: "house-words", target: "user" })).status, 404);

  result = await post("/api/packs/remove", { id: "team-words" });
  assert.equal(result.status, 200, result.error);
  assert.equal(packOf(result.state, "team-words"), undefined);
  assert.deepEqual((await updates()).packs, []);
  assert.equal((await post("/api/packs/remove", { id: "vocabulary" })).status, 400);
  assert.equal((await post("/api/packs/remove", { id: "extra-words" })).status, 400);
});
