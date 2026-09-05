import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  appendProjectRecord, listProjects, projectFile, projectKey, projectsDir, recordsPath, registerProject, stateDir,
} from "../plugins/concise/hooks/lib/projects.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "concise-projects-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { HOME: join(root, "home") };
  const cwd = join(root, "My Project");
  await mkdir(cwd, { recursive: true });
  return { root, env, cwd };
}

test("registry files are named from the folder and keyed by the real path", async (t) => {
  const { root, env, cwd } = await fixture(t);
  const alias = join(root, "alias");
  await symlink(cwd, alias);
  assert.equal(projectKey(alias).key, projectKey(cwd).key);
  assert.equal(projectFile(alias, env), projectFile(cwd, env));
  assert.match(projectFile(cwd, env), /\/my-project-[0-9a-f]{12}\.json$/);
  assert.ok(projectFile(cwd, env).startsWith(join(env.HOME, ".config", "concise", "projects")));
  assert.ok(recordsPath(cwd, env).startsWith(join(env.HOME, ".local", "state", "concise", "projects")));
  const xdg = { XDG_CONFIG_HOME: join(root, "xdg"), XDG_STATE_HOME: join(root, "xdg-state") };
  assert.equal(projectFile(cwd, xdg), join(root, "xdg", "concise", "projects", basename(projectFile(cwd, env))));
  assert.ok(recordsPath(cwd, xdg).startsWith(join(root, "xdg-state", "concise")));
  assert.equal(projectsDir({}), null);
  assert.equal(stateDir({}), null);
  assert.equal(registerProject(cwd, {}), null);
  assert.equal(appendProjectRecord({ cwd }, {}), false);
});

test("registration is throttled to one write per minute and keeps firstSeen", async (t) => {
  const { env, cwd } = await fixture(t);
  const first = registerProject(cwd, env, Date.parse("2026-09-05T10:00:00Z"));
  assert.equal(first.name, "my-project");
  assert.equal(first.cwd, projectKey(cwd).cwd);
  assert.equal(first.records, recordsPath(cwd, env));
  const second = registerProject(cwd, env, Date.parse("2026-09-05T10:00:30Z"));
  assert.equal(second.lastSeen, first.lastSeen);
  const third = registerProject(cwd, env, Date.parse("2026-09-05T10:01:30Z"));
  assert.equal(third.lastSeen, "2026-09-05T10:01:30.000Z");
  assert.equal(third.firstSeen, first.firstSeen);
  await writeFile(join(projectsDir(env), "junk.json"), "{");
  await writeFile(join(projectsDir(env), "notes.txt"), "x");
  const listed = listProjects(env);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].key, projectKey(cwd).key);
  assert.equal(listed[0].file, projectFile(cwd, env));
  assert.deepEqual(JSON.parse(await readFile(listed[0].file, "utf8")), third);
});

test("records append as JSON lines, skip oversized entries, and rotate at 5 MiB", async (t) => {
  const { env, cwd } = await fixture(t);
  const path = recordsPath(cwd, env);
  assert.equal(appendProjectRecord({ cwd, hook: "check-edit", request: {}, response: {} }, env), true);
  assert.equal(JSON.parse((await readFile(path, "utf8")).trim()).hook, "check-edit");
  assert.equal(appendProjectRecord({ cwd, request: { content: "x".repeat(2 * 1024 * 1024) } }, env), false);
  assert.equal((await readFile(path, "utf8")).trim().split("\n").length, 1);
  for (let i = 0; i < 6; i += 1) assert.equal(appendProjectRecord({ cwd, i, pad: "x".repeat(1024 * 1024) }, env), true);
  assert.ok(existsSync(`${path}.1`));
  assert.equal((await readFile(path, "utf8")).trim().split("\n").length, 1);
});
