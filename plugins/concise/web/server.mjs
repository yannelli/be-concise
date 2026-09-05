import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { hubPath, monitorPath } from "../hooks/lib/monitor.mjs";
import { applyLayer } from "../hooks/lib/config-layers.mjs";
import { defaultConfig } from "../hooks/lib/config.mjs";
import { runTest, disposeTests } from "./testing/runner.mjs";
import { configuration, saveConfiguration, validateConfig, problem } from "./configuration.mjs";
import { createHub } from "./hub.mjs";
import { RELEASES_URL, addPack, checkUpdates, packSources, packTargets, removePack, togglePack, updatePack } from "./packs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIMIT = 2 * 1024 * 1024;
const HISTORY_BYTES = 16 * 1024 * 1024;
const RETAINED = 500;
const equal = (a, b) => typeof a === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function body(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > LIMIT) throw problem("Request exceeds 2 MiB", 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
  catch { throw problem("Invalid JSON request"); }
}

function runCatalog(cwd, config, env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [resolve(HERE, "catalog.mjs")], { env, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; if (output.length > LIMIT) child.kill("SIGKILL"); });
    child.stderr.on("data", (chunk) => { error = (error + chunk).slice(-4096); });
    child.stdin.on("error", () => {});
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(error || "Pattern catalog exceeded its time or output limit"));
      try { resolveResult(JSON.parse(output)); } catch { reject(new Error("Pattern catalog returned invalid JSON")); }
    });
    child.stdin.end(JSON.stringify({ cwd, config }));
  });
}

function register(path, registry, scope) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const current = JSON.parse(readFileSync(path, "utf8"));
    if (Number.isInteger(current.pid) && current.pid > 0) {
      try { process.kill(current.pid, 0); throw problem(`A console is already registered ${scope} at ${current.url}`, 409); }
      catch (err) { if (err.code !== "ESRCH") throw err; }
    }
    rmSync(path, { force: true });
  } catch (err) {
    if (err.status || (err.code && err.code !== "ENOENT")) throw err;
    if (!err.code) rmSync(path, { force: true });
  }
  writeFileSync(path, JSON.stringify(registry), { flag: "wx", mode: 0o600 });
}

export async function startServer({ cwd = process.cwd(), port = 0, remote = false, env = process.env, all = false, releasesUrl = RELEASES_URL } = {}) {
  cwd = all ? null : await realpath(cwd);
  env = { ...env };
  const catalog = (target, config) => runCatalog(target, config, env);
  if (cwd && env.BEC_CONFIG_PATH) env.BEC_CONFIG_PATH = resolve(cwd, env.BEC_CONFIG_PATH);
  const hostnames = [];
  if (remote) {
    try {
      const status = JSON.parse(execFileSync("tailscale", ["status", "--json", "--peers=false"], {
        env, encoding: "utf8", timeout: 1000, stdio: ["ignore", "pipe", "ignore"],
      }));
      const name = status.Self?.DNSName?.replace(/\.$/, "");
      if (name) hostnames.push(name, name.split(".")[0]);
    } catch {}
  }
  const proxyOrigin = env.PASEO_URL ? new URL(env.PASEO_URL).origin : null;
  const allowedOrigins = new Map();
  const token = randomBytes(32).toString("hex");
  const records = [];
  const streams = new Set();
  let bytes = 0;
  let sequence = 0;
  let jobs = 0;
  let url;
  let hub = null;
  const send = (response, value, status = 200) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(value));
  };
  const capacity = () => RETAINED * (hub ? Math.max(hub.size(), 1) : 1);
  const publish = (record) => {
    const value = { ...record, id: ++sequence, ts: record.ts || new Date().toISOString() };
    const data = JSON.stringify(value);
    const size = Buffer.byteLength(data);
    if (size > LIMIT) return;
    records.push({ value, size });
    bytes += size;
    while (records.length > capacity() || bytes > HISTORY_BYTES) bytes -= records.shift().size;
    for (const stream of streams) if (!stream.write(`event: record\ndata: ${data}\n\n`)) stream.end();
  };
  if (all) hub = createHub(env, { retained: RETAINED, publish });
  const projects = () => (hub ? hub.list() : [{ key: null, name: basename(cwd), cwd, lastSeen: null }]);
  const projectOf = (route) => {
    if (!hub) return { cwd, key: null };
    const key = route.searchParams.get("project");
    const project = key ? hub.resolve(key) : hub.list()[0] || null;
    return project ? { cwd: project.cwd, key: project.key } : { cwd: null, key: null };
  };
  const state = async ({ cwd: target, key }) => {
    const base = { hub: Boolean(hub), projects: projects(), project: key, defaults: defaultConfig(),
      hooks: JSON.parse(await readFile(resolve(HERE, "../hooks/hooks.json"), "utf8")),
      monitor: { connected: true, retained: RETAINED, maxBytes: HISTORY_BYTES }, runtime: { node: process.version, platform: process.platform } };
    if (!target) return { ...base, cwd: null };
    const config = configuration(target, env);
    let rules;
    try { rules = await catalog(target, config.effective); }
    catch (err) { rules = { packs: [], categories: [], presets: {}, problems: [{ reason: err.message }] }; }
    return { ...base, cwd: target, ...config, ...rules, problems: [...config.effective.problems, ...rules.problems],
      packTargets: packTargets(target, env).map(({ id, label, dir }) => ({ id, label, dir })), packSources: packSources(target, env) };
  };
  const clear = (key) => {
    hub?.clear(key);
    const kept = records.filter(({ value }) => key && value.project !== key);
    records.length = 0;
    records.push(...kept);
    bytes = kept.reduce((sum, { size }) => sum + size, 0);
    for (const stream of streams) stream.write(`event: cleared\ndata: ${JSON.stringify({ project: key })}\n\n`);
  };
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const requestOrigin = allowedOrigins.get(request.headers.host);
      if (!requestOrigin) throw problem("Invalid Host", 403);
      if (request.headers.origin && request.headers.origin !== requestOrigin) throw problem("Invalid Origin", 403);
      const route = new URL(request.url, url);
      if (!route.pathname.startsWith("/api/")) {
        if (request.method !== "GET") throw problem("Method not allowed", 405);
        const name = route.pathname === "/" ? "index.html" : route.pathname.slice(1);
        if (!/^[a-z0-9-]+\.(html|mjs|css|svg|woff2)$/.test(name)) throw problem("Not found", 404);
        const asset = name === "icon-dark.svg" ? "icon.svg" : name;
        let content;
        try { content = await readFile(resolve(HERE, asset.endsWith(".woff2") || asset === "icon.svg" ? "../assets" : "public", asset)); } catch { throw problem("Not found", 404); }
        if (name === "icon-dark.svg") content = content.toString().replace('fill="#18191D"', 'fill="#FAF7F2"');
        const type = ({ html: "text/html", mjs: "text/javascript", css: "text/css", svg: "image/svg+xml", woff2: "font/woff2" })[name.split(".").pop()];
        response.setHeader("Content-Type", type + (type.startsWith("font/") ? "" : "; charset=utf-8"));
        return response.end(content);
      }
      const credential = request.headers.authorization?.replace(/^Bearer /, "") || (route.pathname === "/api/events" ? route.searchParams.get("token") : null);
      if (!equal(credential, token)) throw problem("Unauthorized", 401);
      const method = request.method;
      if (route.pathname === "/api/projects" && method === "GET") return send(response, { hub: Boolean(hub), projects: projects() });
      if (route.pathname === "/api/history" && method === "GET") {
        const key = hub ? route.searchParams.get("project") : null;
        return send(response, { records: records.map(({ value }) => value).filter((value) => !key || value.project === key) });
      }
      if (route.pathname === "/api/events" && method === "GET") {
        response.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive", "X-Accel-Buffering": "no" });
        response.write("event: ready\ndata: {}\n\n");
        for (const { value } of records) response.write(`event: record\ndata: ${JSON.stringify(value)}\n\n`);
        streams.add(response);
        const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15000);
        response.on("close", () => { clearInterval(heartbeat); streams.delete(response); });
        return;
      }
      if (route.pathname === "/api/ingest" && method === "POST") {
        if (hub) throw problem("The hub reads project record files and takes no direct hook records", 405);
        const record = await body(request);
        if (!record || typeof record.hook !== "string" || typeof record.request !== "object" || typeof record.response !== "object") throw problem("Invalid hook record");
        if (typeof record.cwd !== "string" || await realpath(record.cwd) !== cwd) throw problem("Hook belongs to another project", 400);
        publish({ ...record, source: "live" });
        return send(response, { ok: true });
      }
      if (route.pathname === "/api/clear" && method === "POST") {
        const key = hub ? route.searchParams.get("project") : null;
        if (key) hub.resolve(key);
        clear(key);
        return send(response, { ok: true });
      }
      if (jobs >= 4) throw problem("Console is busy. Try again after the current operation finishes.", 429);
      jobs++;
      try {
        const project = projectOf(route);
        if (route.pathname === "/api/state" && method === "GET") return send(response, await state(project));
        if (!project.cwd) throw problem("No project is registered yet. Run a hook in a project first.", 404);
        if (route.pathname === "/api/config" && method === "PATCH") {
          saveConfiguration(project.cwd, env, await body(request));
          return send(response, await state(project));
        }
        if (route.pathname === "/api/test" && method === "POST") {
          const input = await body(request);
          if (!input || typeof input !== "object" || Array.isArray(input)) throw problem("Test must be an object");
          const effective = configuration(project.cwd, env).effective;
          const config = input.config ? applyLayer(effective, validateConfig(input.config)) : effective;
          const result = await runTest({ ...input, cwd: project.cwd, env, config });
          for (const hook of result.hooks) publish({ ...hook, source: "test", project: project.key });
          return send(response, result);
        }
        if (route.pathname === "/api/packs/toggle" && method === "POST") {
          const result = await togglePack({ ...await body(request), cwd: project.cwd, env, catalog });
          return send(response, { ...result, state: await state(project) });
        }
        if (route.pathname === "/api/packs/add" && method === "POST") {
          const result = await addPack({ ...await body(request), cwd: project.cwd, env });
          return send(response, { ...result, state: await state(project) });
        }
        if (route.pathname === "/api/packs/remove" && method === "POST") {
          const result = await removePack({ ...await body(request), cwd: project.cwd, env, catalog });
          return send(response, { ...result, state: await state(project) });
        }
        if (route.pathname === "/api/packs/updates" && method === "GET") return send(response, await checkUpdates({ cwd: project.cwd, env, releasesUrl }));
        if (route.pathname === "/api/packs/update" && method === "POST") {
          const result = await updatePack({ ...await body(request), cwd: project.cwd, env });
          return send(response, { ...result, state: await state(project) });
        }
        throw problem("Not found", 404);
      } finally { jobs--; }
    } catch (err) {
      if (!response.headersSent) send(response, { error: err.message }, err.status || 500);
      else response.end();
    }
  });
  server.requestTimeout = 20000;
  await new Promise((resolveReady, reject) => { server.once("error", reject); server.listen(port, remote ? "0.0.0.0" : "127.0.0.1", resolveReady); });
  url = `http://127.0.0.1:${server.address().port}`;
  const networkUrls = remote ? [...new Set([...Object.values(networkInterfaces()).flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => address.address), ...hostnames])]
    .map((host) => `http://${host}:${server.address().port}`) : [];
  allowedOrigins.set(new URL(url).host, url);
  for (const origin of networkUrls) allowedOrigins.set(new URL(origin).host, origin);
  if (proxyOrigin) allowedOrigins.set(new URL(proxyOrigin).host, proxyOrigin);
  const registryPath = hub ? hubPath(env) : monitorPath(cwd, env);
  try { register(registryPath, { url, token, pid: process.pid }, hub ? "for all projects" : "for this project"); }
  catch (err) { hub?.close(); server.close(); throw err; }
  return {
    url, browserUrl: proxyOrigin || url, networkUrls, token, cwd, registryPath, hub: Boolean(hub), projectsDir: hub?.dir ?? null,
    async close() {
      try { if (JSON.parse(readFileSync(registryPath, "utf8")).token === token) rmSync(registryPath, { force: true }); } catch {}
      hub?.close();
      for (const stream of streams) stream.end();
      await new Promise((done) => { server.close(done); server.closeAllConnections(); });
      await disposeTests();
    },
  };
}
