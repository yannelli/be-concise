import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hubPath, monitorPath } from "../plugins/concise/hooks/lib/monitor.mjs";

const BIN = fileURLToPath(new URL("../bin/concise-web.mjs", import.meta.url));
const tailscale = `#!/bin/sh\nprintf '%s' '{"Self":{"DNSName":"console.example.ts.net."}}'\n`;

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "concise-bin-test-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "project");
  const bin = join(root, "bin");
  await Promise.all([cwd, bin, join(root, "tmp")].map((dir) => mkdir(dir)));
  const env = {
    PATH: bin, HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config"),
    XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"), TMPDIR: join(root, "tmp"),
    ...(process.env.NODE_V8_COVERAGE ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE } : {}),
  };
  const tool = (name, body) => writeFile(join(bin, name), body, { mode: 0o755 });
  return { root, cwd, bin, env, tool };
}

function run(args, { env, cwd }) {
  const child = spawn(process.execPath, [BIN, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const output = { stdout: "", stderr: "" };
  const waiters = [];
  const check = () => {
    for (const waiter of [...waiters]) {
      if (waiter.pattern.test(output[waiter.stream])) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(output[waiter.stream]);
      }
    }
  };
  for (const stream of ["stdout", "stderr"]) child[stream].on("data", (chunk) => { output[stream] += chunk; check(); });
  const exited = new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal, ...output })));
  const wait = (pattern, stream = "stdout") => new Promise((resolve, reject) => {
    waiters.push({ pattern, stream, resolve });
    check();
    exited.then((result) => reject(new Error(`exited before ${pattern}: ${JSON.stringify(result)}`)));
  });
  return { child, exited, wait };
}

async function started(t, args, space) {
  const app = run(args, space);
  t.after(() => app.child.kill("SIGKILL"));
  const stdout = await app.wait(/Press Ctrl\+C to stop\.\n/);
  const [, url, token] = /^Concise console: (http:\/\/127\.0\.0\.1:\d+)\/#token=([0-9a-f]{64})\n/.exec(stdout);
  assert.equal((await fetch(url)).status, 200);
  return { ...app, stdout, url, token };
}

test("help prints usage for --help and -h", async (t) => {
  const space = await fixture(t);
  for (const flag of ["--help", "-h"]) {
    const result = await run([flag, "--bogus"], space).exited;
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^Usage: concise-web \[--cwd PATH \| --all\] \[--port PORT\] \[--remote\] \[--no-open\]\n/);
    assert.equal(result.stderr, "");
  }
});

test("argument and startup errors exit 1 with a message", async (t) => {
  const space = await fixture(t);
  const cases = [
    [["--bogus"], "Unknown option: --bogus"],
    [["--port"], "Missing value for --port"],
    [["--cwd", "--all"], "Missing value for --cwd"],
    [["--port", "abc"], "--port must be an integer from 0 to 65535"],
    [["--port", "65536"], "--port must be an integer from 0 to 65535"],
    [["--all", "--cwd", space.cwd], "--all and --cwd are exclusive"],
  ];
  for (const [args, message] of cases) {
    const result = await run(args, space).exited;
    assert.equal(result.code, 1, args.join(" "));
    assert.equal(result.stderr, `concise-web: ${message}\n`);
    assert.equal(result.stdout, "");
  }
  const missing = await run(["--no-open", "--cwd", join(space.root, "missing")], space).exited;
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /^concise-web: ENOENT/);
});

test("update parses its options and exits 1 when a step fails", async (t) => {
  const space = await fixture(t);
  const help = await run(["update", "-h"], space).exited;
  assert.equal(help.code, 0);
  assert.match(help.stdout, /\n {7}concise-web update \[--check\]\n/);
  const bogus = await run(["update", "--bogus"], space).exited;
  assert.deepEqual([bogus.code, bogus.stdout, bogus.stderr], [1, "", "concise-web: Unknown option: --bogus\n"]);
  const check = await run(["update", "--check"], space).exited;
  assert.equal(check.code, 0);
  assert.match(check.stdout, /^Package: .+ is a git checkout, skipped\. Update it with git pull\.\n$/);
  await space.tool("claude", `#!/bin/sh\n[ "$2" = list ] && echo concise@be-concise\n[ "$2" = update ] && { echo "Error: denied" >&2; exit 1; }\nexit 0\n`);
  const failed = await run(["update"], space).exited;
  assert.equal(failed.code, 1);
  assert.match(failed.stdout, /\nclaude: update failed: Error: denied\n$/);
});

test("a signal sent as soon as the console line prints removes the registry file", async (t) => {
  const space = await fixture(t);
  const app = run(["--no-open", "--cwd", space.cwd], space);
  t.after(() => app.child.kill("SIGKILL"));
  await app.wait(/^Concise console: /);
  assert.equal(existsSync(monitorPath(space.cwd, space.env)), true);
  app.child.kill("SIGTERM");
  const result = await app.exited;
  assert.deepEqual([result.code, result.signal, result.stderr], [0, null, ""]);
  assert.equal(existsSync(monitorPath(space.cwd, space.env)), false);
});

test("--cwd serves one project and SIGINT shuts it down once", async (t) => {
  const space = await fixture(t);
  const app = await started(t, ["--no-open", "--cwd", space.cwd, "--port", "0"], space);
  assert.match(app.stdout, new RegExp(`\\nProject: ${space.cwd}\\nPress Ctrl\\+C to stop\\.\\n$`));
  const headers = { Authorization: `Bearer ${app.token}`, "Content-Type": "application/json" };
  const response = await fetch(`${app.url}/api/projects`, { headers });
  assert.deepEqual((await response.json()).projects.map((project) => project.cwd), [space.cwd]);
  const body = JSON.stringify({ kind: "Write", path: "notes.md", text: "plain text" });
  const running = fetch(`${app.url}/api/test`, { method: "POST", headers, body }).catch(() => null);
  const playgrounds = async () => (await readdir(space.env.TMPDIR)).filter((name) => name.startsWith("concise-playground-"));
  while ((await playgrounds()).length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
  app.child.kill("SIGINT");
  app.child.kill("SIGTERM");
  const result = await app.exited;
  await running;
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(await playgrounds(), []);
  assert.equal(existsSync(monitorPath(space.cwd, space.env)), false);
  await assert.rejects(fetch(app.url));
});

test("--all serves the project registry and SIGTERM shuts it down", async (t) => {
  const space = await fixture(t);
  const app = await started(t, ["--all", "--no-open"], { ...space, cwd: space.root });
  assert.match(app.stdout, new RegExp(`\\nProjects: ${join(space.env.XDG_CONFIG_HOME, "concise", "projects")}\\n`));
  const registry = hubPath(space.env);
  assert.equal(JSON.parse(await readFile(registry, "utf8")).token, app.token);
  app.child.kill("SIGTERM");
  const result = await app.exited;
  assert.equal(result.code, 0);
  assert.equal(existsSync(registry), false);
});

test("--remote prints network console addresses", async (t) => {
  const space = await fixture(t);
  await space.tool("tailscale", tailscale);
  const app = await started(t, ["--remote", "--no-open", "--cwd", space.cwd], space);
  const port = new URL(app.url).port;
  assert.ok(app.stdout.includes(`Network console: http://console.example.ts.net:${port}/#token=${app.token}\n`));
  assert.ok(app.stdout.includes(`Network console: http://console:${port}/#token=${app.token}\n`));
  app.child.kill("SIGTERM");
  assert.equal((await app.exited).code, 0);
});

test("the browser opens the console URL with xdg-open", async (t) => {
  const space = await fixture(t);
  const opened = join(space.root, "opened.txt");
  await space.tool("xdg-open", `#!/bin/sh\nprintf '%s' "$1" > '${opened}'\n`);
  const app = await started(t, ["--cwd", space.cwd], space);
  const expected = `${app.url}/#token=${app.token}`;
  const read = () => readFile(opened, "utf8").catch(() => "");
  while (await read() !== expected) await new Promise((resolve) => setTimeout(resolve, 10));
  app.child.kill("SIGTERM");
  const result = await app.exited;
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
});

test("a failing or missing browser command prints a fallback hint", async (t) => {
  for (const command of ["#!/bin/sh\nexit 3\n", null]) {
    const space = await fixture(t);
    if (command) await space.tool("xdg-open", command);
    const app = await started(t, ["--cwd", space.cwd], space);
    assert.equal(await app.wait(/\n$/, "stderr"), "Browser launch failed. Open the console URL above.\n");
    app.child.kill("SIGTERM");
    assert.equal((await app.exited).code, 0);
  }
});

test("macOS and Windows open the console URL with their launchers", async (t) => {
  for (const [platform, command, expected] of [["darwin", "open", (url) => url], ["win32", "rundll32", (url) => `url.dll,FileProtocolHandler ${url}`]]) {
    const space = await fixture(t);
    const opened = join(space.root, "opened.txt");
    const preload = join(space.root, "platform.mjs");
    await writeFile(preload, `Object.defineProperty(process, "platform", { value: ${JSON.stringify(platform)} });\n`);
    await space.tool(command, `#!/bin/sh\nprintf '%s' "$*" > '${opened}'\n`);
    const app = await started(t, ["--cwd", space.cwd], { ...space, env: { ...space.env, NODE_OPTIONS: `--import=${preload}` } });
    const url = `${app.url}/#token=${app.token}`;
    const read = () => readFile(opened, "utf8").catch(() => "");
    while (await read() !== expected(url)) await new Promise((resolve) => setTimeout(resolve, 10));
    app.child.kill("SIGTERM");
    const result = await app.exited;
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
  }
});
