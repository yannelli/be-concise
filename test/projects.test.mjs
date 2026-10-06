import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  appendProjectRecord, gitRepo, listProjects, projectFile, projectKey, projectsDir, recordsPath, registerProject, stateDir,
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

test("gitRepo names the repo and linked worktree from .git markers in cwd or its parents", async (t) => {
  const { root } = await fixture(t);
  const main = join(root, "be-concise");
  await mkdir(join(main, ".git", "worktrees", "old-mantis"), { recursive: true });
  await mkdir(join(main, "plugins", "web"), { recursive: true });
  assert.deepEqual(gitRepo(main), { name: "be-concise", root: main, worktree: null, subdir: "" });
  assert.deepEqual(gitRepo(join(main, "plugins", "web")), { name: "be-concise", root: main, worktree: null, subdir: join("plugins", "web") });
  const linked = join(root, "worktrees", "old-mantis");
  await mkdir(join(linked, "src"), { recursive: true });
  await writeFile(join(linked, ".git"), `gitdir: ${join(main, ".git", "worktrees", "old-mantis")}\n`);
  assert.deepEqual(gitRepo(join(linked, "src")), { name: "be-concise", root: main, worktree: "old-mantis", subdir: "src" });
  const sibling = join(root, "sibling");
  await mkdir(sibling);
  await writeFile(join(sibling, ".git"), "gitdir: ../bare.git/worktrees/sibling");
  assert.deepEqual(gitRepo(sibling), { name: "bare", root: join(root, "bare.git"), worktree: "sibling", subdir: "" });
  const submodule = join(main, "vendor", "lib");
  await mkdir(submodule, { recursive: true });
  await writeFile(join(submodule, ".git"), "gitdir: ../../.git/modules/lib\n");
  assert.deepEqual(gitRepo(submodule), { name: "lib", root: submodule, worktree: null, subdir: "" });
  assert.equal(gitRepo(join(root, "plain")), null);
});

test("registration stores the repo, and entries written before the repo field still list", async (t) => {
  const { root, env, cwd } = await fixture(t);
  await mkdir(join(cwd, ".git"));
  assert.deepEqual(registerProject(cwd, env).repo, { name: "My Project", root: projectKey(cwd).cwd, worktree: null, subdir: "" });
  const legacy = join(root, "legacy");
  const { key } = projectKey(legacy);
  const entry = { cwd: legacy, name: "legacy", key, firstSeen: "2026-01-01T00:00:00.000Z", lastSeen: "2026-01-01T00:00:00.000Z", records: recordsPath(legacy, env) };
  await writeFile(projectFile(legacy, env), JSON.stringify(entry));
  const listed = listProjects(env);
  assert.deepEqual(listed.map((project) => project.name), ["my-project", "legacy"]);
  assert.equal("repo" in listed[1], false);
});
