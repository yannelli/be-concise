import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { appendFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHub } from "../plugins/concise/web/hub.mjs";
import { projectKey, recordsPath, registerProject } from "../plugins/concise/hooks/lib/projects.mjs";

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "concise-hub-cov-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "project");
  await mkdir(cwd);
  const env = { HOME: join(root, "home") };
  const published = [];
  const open = () => {
    const hub = createHub(env, { retained: 10, publish: (record) => published.push(record) });
    t.after(() => hub.close());
    return hub;
  };
  return { root, cwd, env, published, open, key: projectKey(cwd).key };
}

const line = (hook) => `${JSON.stringify({ hook })}\n`;

test("hub needs a home or XDG directory", () => {
  assert.throws(() => createHub({}, { retained: 1, publish() {} }), (err) => err.status === 500 && /needs HOME or XDG_CONFIG_HOME/.test(err.message));
});

test("hub tolerates projects whose record files do not exist yet", async (t) => {
  const { cwd, env, published, open, key } = await fixture(t);
  registerProject(cwd, env);
  const hub = open();
  assert.equal(hub.size(), 1);
  assert.deepEqual(hub.list().map((project) => project.cwd), [cwd]);
  assert.equal(hub.resolve(null), null);
  assert.equal(hub.resolve(key).cwd, cwd);
  hub.clear();
  hub.clear(key);
  assert.equal(fs.existsSync(recordsPath(cwd, env)), false);
  assert.deepEqual(published, []);
});

test("hub skips blank and malformed lines and rereads truncated files", async (t) => {
  const { cwd, env, published, open } = await fixture(t);
  registerProject(cwd, env);
  const path = recordsPath(cwd, env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `not json\n${line("first")}`);
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  open();
  assert.deepEqual(published.map((record) => record.hook), ["first"]);
  await appendFile(path, `\n  \n{broken\n${line("second")}`);
  t.mock.timers.tick(5000);
  assert.deepEqual(published.map((record) => record.hook), ["first", "second"]);
  await writeFile(path, line("third"));
  t.mock.timers.tick(5000);
  t.mock.timers.reset();
  assert.deepEqual(published.map((record) => record.hook), ["first", "second", "third"]);
  assert.ok(published.every((record) => record.projectName === "project"));
});

test("hub ignores watcher errors", async (t) => {
  const { cwd, env, published, open } = await fixture(t);
  const watch = fs.watch;
  const errors = [];
  const mocked = t.mock.method(fs, "watch", (...args) => {
    const watcher = watch(...args);
    process.nextTick(() => { errors.push(watcher.listenerCount("error")); watcher.emit("error", new Error("watch failed")); });
    return watcher;
  });
  syncBuiltinESMExports();
  t.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
  const hub = open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [1]);
  registerProject(cwd, env);
  for (let i = 0; i < 200 && hub.size() === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(hub.size(), 1);
  assert.deepEqual(published, []);
});

test("hub flags deleted project directories and labels repos live or from the stored entry", async (t) => {
  const { root, cwd, env, open, key } = await fixture(t);
  const main = join(root, "repo");
  await mkdir(join(main, ".git"), { recursive: true });
  await writeFile(join(cwd, ".git"), `gitdir: ${join(main, ".git", "worktrees", "project")}\n`);
  const gone = join(root, "gone");
  await mkdir(gone);
  await writeFile(join(gone, ".git"), `gitdir: ${join(main, ".git", "worktrees", "gone")}\n`);
  const now = Date.now();
  registerProject(cwd, env, now);
  registerProject(gone, env, now - 1000);
  registerProject(join(root, "never-a-repo"), env, now - 2000);
  await rm(gone, { recursive: true });
  const hub = open();
  assert.deepEqual(hub.list().map(({ name, missing, repo }) => [name, missing, repo?.name ?? null, repo?.worktree ?? null]), [
    ["project", false, "repo", "project"], ["gone", true, "repo", "gone"], ["never-a-repo", true, null, null],
  ]);
  assert.deepEqual(hub.resolve(key), { key, name: "project", cwd, missing: false });
});
