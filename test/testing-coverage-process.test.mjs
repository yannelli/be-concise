import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runProcess } from "../plugins/concise/web/testing/process.mjs";

const worker = fileURLToPath(new URL("../plugins/concise/web/testing/worker.mjs", import.meta.url));
const node = (source, input = "") => runProcess(process.execPath, ["-e", source], { input, cwd: tmpdir(), env: process.env });

test("runProcess returns stdout, stderr, fd 3 metadata, and the exit status", async () => {
  const ok = await node("process.stdout.write('out'); process.stderr.write('err'); require('fs').writeSync(3, 'meta')");
  assert.deepEqual([ok.stdout, ok.stderr, ok.metadata, ok.exitCode, ok.error], ["out", "err", "meta", 0, null]);
  const failed = await node("process.exit(3)", "x".repeat(4 * 1024 * 1024));
  assert.equal(failed.error, "Hook exited with 3");
  const signaled = await node("process.kill(process.pid, 'SIGTERM')");
  assert.equal(signaled.error, "Hook exited with SIGTERM");
});

test("runProcess reports a command that cannot start", async () => {
  const result = await runProcess(join(tmpdir(), "concise-missing-command"), [], { input: "", cwd: tmpdir(), env: process.env });
  assert.match(result.error, /ENOENT/);
  assert.equal(result.stdout, "");
});

test("runProcess kills the process group when output exceeds 2 MiB", async () => {
  const result = await node("process.stdout.write('x'.repeat(3 * 1024 * 1024)); setInterval(() => {}, 1000)");
  assert.equal(result.error, "Hook output exceeded 2 MiB");
  assert.ok(result.stdout.length <= 2 * 1024 * 1024);
});

test("runProcess falls back to killing the child when the group kill fails", async (t) => {
  const kill = t.mock.method(process, "kill", () => { throw new Error("EPERM"); });
  const result = await node("process.stdout.write('x'.repeat(3 * 1024 * 1024)); setInterval(() => {}, 1000)");
  assert.equal(result.error, "Hook output exceeded 2 MiB");
  assert.ok(kill.mock.calls.length >= 1);
  assert.ok(kill.mock.calls[0].arguments[0] < 0);
});

test("runProcess stops a hook after 15 seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const running = node("setInterval(() => {}, 1000)");
  t.mock.timers.tick(15_000);
  const result = await running;
  assert.equal(result.error, "Hook exceeded the 15 second timeout");
  assert.equal(result.exitCode, null);
  const missing = runProcess(join(tmpdir(), "concise-missing-command"), [], { input: "", cwd: tmpdir(), env: process.env });
  t.mock.timers.tick(15_000);
  assert.equal((await missing).error, "Hook exceeded the 15 second timeout");
});

test("runProcess ignores EPIPE on stdin and reports other stdin errors", async (t) => {
  const spawn = childProcess.spawn;
  let code;
  t.mock.method(childProcess, "spawn", (...args) => {
    const child = spawn(...args);
    setImmediate(() => child.stdin.emit("error", Object.assign(new Error(`stdin ${code}`), { code })));
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  code = "EPIPE";
  assert.equal((await node("setTimeout(() => {}, 100)")).error, null);
  code = "EIO";
  assert.equal((await node("setTimeout(() => {}, 100)")).error, "stdin EIO");
});

async function workerEnv(t) {
  const directory = await mkdtemp(join(tmpdir(), "concise-worker-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home");
  await mkdir(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"),
    TMPDIR: directory, BEC_MONITOR_DISABLED: "1" };
  delete env.BEC_CONFIG_PATH;
  return { directory, env };
}

test("the playground worker rejects unknown hooks", async (t) => {
  const { directory, env } = await workerEnv(t);
  const result = await runProcess(process.execPath, [worker, "session-end", join(directory, "request.json")], { input: "{}", cwd: directory, env });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Unsupported playground hook/);
  assert.equal(result.metadata, "");
});

test("the playground worker reports scan failures in its diagnostics", async (t) => {
  const { directory, env } = await workerEnv(t);
  const request = { hook_event_name: "Stop", cwd: directory, session_id: "worker-test", transcript_path: join(directory, "missing.jsonl") };
  const requestPath = join(directory, "request.json");
  await writeFile(requestPath, JSON.stringify(request));
  const result = await runProcess(process.execPath, [worker, "check-reply", requestPath], { input: JSON.stringify(request), cwd: directory, env });
  assert.equal(result.exitCode, 0);
  const metadata = JSON.parse(result.metadata);
  assert.match(metadata.error, /^Match diagnostics: ENOENT/);
  assert.deepEqual(metadata.matches, []);
  assert.deepEqual(JSON.parse(result.stdout), {});
});
