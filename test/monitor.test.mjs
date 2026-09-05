import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { monitorPath, publishMonitor } from "../plugins/concise/hooks/lib/monitor.mjs";

const hooks = fileURLToPath(new URL("../plugins/concise/hooks/", import.meta.url));

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), "concise-monitor-test-"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("BEC_")));
  env.HOME = join(cwd, "home");
  env.USERPROFILE = env.HOME;
  env.XDG_CONFIG_HOME = join(cwd, "config");
  env.XDG_CACHE_HOME = join(cwd, "cache");
  const session = randomUUID();
  t.after(() => rm(cwd, { recursive: true, force: true }));
  t.after(() => rm(join(tmpdir(), `concise-state-${session}.json`), { force: true }));
  return { cwd, env, session };
}

async function registry(cwd, env, value) {
  const path = monitorPath(cwd, env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value), { mode: 0o600 });
}

async function receiver(t, { cwd, env }, { respond = true } = {}) {
  const received = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({
      path: request.url,
      authorization: request.headers.authorization,
      record: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    });
    if (respond) response.writeHead(204).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const url = `http://127.0.0.1:${server.address().port}`;
  await registry(cwd, env, { url, token: "monitor-test-token", pid: process.pid });
  return { received, url, server };
}

function run(command, args, input, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, timeout: 10000 });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.stdin.on("error", () => {});
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
    child.stdin.end(typeof input === "string" ? input : JSON.stringify(input));
  });
}

test("monitor registries identify real project paths and work without HOME", async (t) => {
  const { cwd, env } = await fixture(t);
  const project = join(cwd, "project");
  const alias = join(cwd, "alias");
  await mkdir(project);
  await symlink(project, alias);
  assert.equal(monitorPath(project, env), monitorPath(alias, env));
  assert.notEqual(monitorPath(project, env), monitorPath(join(cwd, "another"), env));
  assert.ok(monitorPath(project, env).startsWith(join(env.XDG_CACHE_HOME, "concise", "monitor")));
  assert.ok(monitorPath(project, {}).startsWith(join(tmpdir(), "concise-")));
});

test("monitor publication tolerates absent, malformed, and stale registries", async (t) => {
  const { cwd, env } = await fixture(t);
  const record = { cwd, request: { text: "input" }, response: {} };
  await publishMonitor(record, { env });
  await registry(cwd, env, "{");
  await publishMonitor(record, { env });
  await registry(cwd, env, { url: "http://127.0.0.1:1", token: "stale" });
  await publishMonitor(record, { env });
});

test("monitor rejects non-loopback destinations and disabled publication", async (t) => {
  const fixtureData = await fixture(t);
  const { cwd, env } = fixtureData;
  const { received, url } = await receiver(t, fixtureData);
  await publishMonitor({ cwd }, { env: { ...env, BEC_MONITOR_DISABLED: "1" } });
  for (const unsafe of ["http://example.com", "https://127.0.0.1", `${url}/elsewhere`, url.replace("http://", "http://user:pass@")]) {
    await registry(cwd, env, { url: unsafe, token: "monitor-test-token" });
    await publishMonitor({ cwd }, { env });
  }
  assert.deepEqual(received, []);
});

test("monitor times out when a receiver does not respond", async (t) => {
  const fixtureData = await fixture(t);
  const { received } = await receiver(t, fixtureData, { respond: false });
  const started = Date.now();
  await publishMonitor({ cwd: fixtureData.cwd }, { env: fixtureData.env });
  assert.equal(received.length, 1);
  assert.ok(Date.now() - started < 2000);
});

test("live hook telemetry includes final soft-fail warnings and all findings", async (t) => {
  const fixtureData = await fixture(t);
  const { cwd, env, session } = fixtureData;
  const { received } = await receiver(t, fixtureData);
  const logPath = join(cwd, "persistent.log");
  env.BEC_CONFIG_JSON = JSON.stringify({
    features: { emDash: { enabled: true, mode: "deny" } },
    softFail: true,
    log: { enabled: true, path: logPath },
  });
  await mkdir(join(cwd, ".claude"));
  await writeFile(join(cwd, ".claude", "concise.json"), "{");
  const input = {
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: join(cwd, "draft.md"), content: Array(25).fill("First — second.").join("\n") },
    cwd,
    session_id: session,
  };
  const result = await run(process.execPath, [join(hooks, "check-edit.mjs")], input, fixtureData);
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.match(response.systemMessage, /soft-fail:/);
  assert.match(response.systemMessage, /config ignored:/);
  assert.equal(received.length, 1);
  assert.equal(received[0].path, "/api/ingest");
  assert.equal(received[0].authorization, "Bearer monitor-test-token");
  const record = received[0].record;
  assert.deepEqual(record.request, input);
  assert.deepEqual(record.response, response);
  assert.equal(record.hook, "check-edit");
  assert.equal(record.decision, "flag");
  assert.equal(record.source, "live");
  assert.equal(record.findings.length, 25);
  assert.equal(record.counts.emDash, 25);
  assert.ok(record.durationMs >= 0);
  const persistent = JSON.parse((await readFile(logPath, "utf8")).trim());
  assert.equal(persistent.findings.length, 20);
  assert.equal(Object.hasOwn(persistent, "request"), false);
});

test("filter wrapper preserves Bash responses and reports the replacement command", async (t) => {
  const fixtureData = await fixture(t);
  const { cwd, session } = fixtureData;
  const { received } = await receiver(t, fixtureData);
  for (const command of ["npm test", "git status", "NOFILTER=1 npm test"]) {
    const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd, session_id: session };
    const [original, wrapped] = await Promise.all([
      run("bash", [join(hooks, "PreToolUse-test-filter.sh")], input, fixtureData),
      run(process.execPath, [join(hooks, "monitor-filter.mjs")], input, fixtureData),
    ]);
    assert.deepEqual(wrapped, original, command);
    const record = received.at(-1).record;
    assert.equal(record.hook, "test-filter");
    assert.deepEqual(record.request, input);
    assert.deepEqual(record.response, JSON.parse(original.stdout));
    assert.equal(record.decision, command === "npm test" ? "rewrite" : "allow");
    if (command === "npm test") assert.match(record.response.hookSpecificOutput.updatedInput.command, /PreToolUse-test-filter\.sh run$/);
  }
  assert.equal(received.length, 3);
});

test("filter wrapper preserves Bash exit and stderr when HOME is unset", async (t) => {
  const fixtureData = await fixture(t);
  delete fixtureData.env.HOME;
  delete fixtureData.env.USERPROFILE;
  const input = { tool_name: "Bash", tool_input: { command: "npm test" }, cwd: fixtureData.cwd };
  const [original, wrapped] = await Promise.all([
    run("bash", [join(hooks, "PreToolUse-test-filter.sh")], input, fixtureData),
    run(process.execPath, [join(hooks, "monitor-filter.mjs")], input, fixtureData),
  ]);
  assert.deepEqual(wrapped, original);
});
