import assert from "node:assert/strict";
import test from "node:test";
import childProcess from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../plugins/concise/web/server.mjs";

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "concise-web-mock-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "project");
  const home = join(root, "home");
  await mkdir(cwd);
  await mkdir(home);
  const env = { PATH: process.env.PATH, HOME: home, XDG_CACHE_HOME: join(root, "cache") };
  const server = await startServer({ cwd, env });
  t.after(() => server.close());
  const get = (path) => new Promise((resolve, reject) => {
    const req = request(`${server.url}${path}`, { headers: { Authorization: `Bearer ${server.token}` } }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, text }));
    });
    req.on("error", reject);
    req.end();
  });
  return { ...server, root, get };
}

function replaceCatalog(t) {
  const spawn = childProcess.spawn;
  const current = { script: null, calls: 0 };
  const mocked = t.mock.method(childProcess, "spawn", (command, args, options) => {
    if (!String(args?.[0]).endsWith("catalog.mjs")) return spawn(command, args, options);
    current.calls += 1;
    if (current.script === null) return spawn(join(tmpdir(), "concise-missing-catalog-command"), [], options);
    return spawn(process.execPath, ["-e", current.script], options);
  });
  syncBuiltinESMExports();
  t.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
  return current;
}

const reasons = (response) => JSON.parse(response.text).problems.map((item) => item.reason);

test("state reports each pattern catalog failure as a problem", async (t) => {
  const app = await fixture(t);
  const catalog = replaceCatalog(t);
  const cases = [
    ["process.stderr.write('catalog exploded'); process.exit(3)", "catalog exploded"],
    ["process.stdout.write('x'.repeat(3 * 1024 * 1024))", "Pattern catalog exceeded its time or output limit"],
    ["process.stdout.write('not json')", "Pattern catalog returned invalid JSON"],
    [null, /ENOENT/],
  ];
  for (const [script, reason] of cases) {
    catalog.script = script;
    const response = await app.get("/api/state");
    assert.equal(response.status, 200);
    const found = reasons(response);
    assert.ok(found.some((item) => (typeof reason === "string" ? item === reason : reason.test(item))), `${script}: ${found}`);
    assert.deepEqual(JSON.parse(response.text).packs, []);
  }
  assert.equal(catalog.calls, cases.length);
});

test("a catalog that exits before reading a large config does not crash the console", async (t) => {
  const app = await fixture(t);
  await mkdir(join(app.cwd, ".claude"));
  await writeFile(join(app.cwd, ".claude", "concise.json"), JSON.stringify({ allowList: { phrases: ["x".repeat(512 * 1024)] } }));
  const catalog = replaceCatalog(t);
  catalog.script = "process.exit(0)";
  const response = await app.get("/api/state");
  assert.equal(response.status, 200);
  assert.ok(reasons(response).includes("Pattern catalog returned invalid JSON"));
});

test("a catalog that runs past 15 seconds is killed", async (t) => {
  const app = await fixture(t);
  const catalog = replaceCatalog(t);
  catalog.script = "setInterval(() => {}, 1000)";
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = app.get("/api/state");
  while (catalog.calls === 0) await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(15000);
  const response = await pending;
  t.mock.timers.reset();
  assert.ok(reasons(response).includes("Pattern catalog exceeded its time or output limit"));
});

test("event streams send a heartbeat every 15 seconds", async (t) => {
  const app = await fixture(t);
  t.mock.timers.enable({ apis: ["setInterval"] });
  const req = request(`${app.url}/api/events?token=${app.token}`);
  const response = await new Promise((resolve, reject) => { req.on("response", resolve); req.on("error", reject); req.end(); });
  let text = "";
  const wait = (needle) => new Promise((resolve) => {
    const check = () => { if (text.includes(needle)) { response.off("data", read); resolve(); } };
    const read = (chunk) => { text += chunk; check(); };
    response.on("data", read);
    check();
  });
  await wait("event: ready");
  t.mock.timers.tick(15000);
  await wait(": heartbeat");
  req.destroy();
  t.mock.timers.reset();
  assert.match(text, /^event: ready\ndata: \{\}\n\n: heartbeat\n\n$/);
});

test("a response that fails after its headers are sent is ended", async (t) => {
  const app = await fixture(t);
  const stringify = JSON.stringify;
  t.mock.method(JSON, "stringify", function (value, ...rest) {
    if (value && typeof value === "object" && Object.keys(value).join() === "hub,projects") throw new Error("serialization failed");
    return stringify.call(this, value, ...rest);
  });
  const response = await app.get("/api/projects");
  assert.equal(response.status, 200);
  assert.equal(response.text, "");
});
