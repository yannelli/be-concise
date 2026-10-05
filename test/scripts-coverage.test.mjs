import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { manifestPaths, verifyConditions } from "../scripts/release-manifests.mjs";
import { release } from "../scripts/release.mjs";

const execute = promisify(execFile);
const script = (name) => fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
const GITHUB_KEYS = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_REPOSITORY", "GITHUB_API_URL", "GITHUB_EVENT_PATH"];
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !GITHUB_KEYS.includes(key) && !key.startsWith("GIT_")));

async function temp(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function writeManifests(cwd, version = "0.5.1", marketplace = [{ name: "concise", version }]) {
  for (const path of manifestPaths) {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    const document = path === manifestPaths[0] ? { plugins: marketplace } : { name: "concise", version };
    await writeFile(join(cwd, path), JSON.stringify(document));
  }
}

async function repository(t, { tag = "v0.5.1" } = {}) {
  const root = await temp(t, "concise-release-cov-");
  const cwd = join(root, "checkout");
  await mkdir(cwd);
  const git = (...args) => execFileSync("git", args, { cwd, env: cleanEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--bare", join(root, "origin.git"));
  git("init", "-b", "main");
  git("config", "user.name", "Release test");
  git("config", "user.email", "release@example.test");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  await writeManifests(cwd);
  git("add", ".");
  git("commit", "-m", "chore: initial fixture");
  if (tag) git("tag", tag);
  git("remote", "add", "origin", join(root, "origin.git"));
  git("push", "origin", "main", "--tags");
  return { cwd, git };
}

const cli = (cwd, args, env = {}) => execute(process.execPath, [script("release.mjs"), ...args], { cwd, env: { ...cleanEnv, ...env } });

test("check-pr validates the pull request from the GitHub event file", async (t) => {
  const directory = await temp(t, "concise-check-pr-");
  const event = join(directory, "event.json");
  const repo = { full_name: "yannelli/be-concise" };
  const write = (title) => writeFile(event, JSON.stringify({ pull_request: { title, body: "", base: { ref: "main", repo }, head: { ref: "feature", repo } } }));
  await write("fix: repair a hook");
  const passed = await execute(process.execPath, [script("check-pr.mjs")], { env: { ...cleanEnv, GITHUB_EVENT_PATH: event } });
  assert.match(passed.stdout, /PR title follows the release guidelines/);
  await write("Update files");
  await assert.rejects(execute(process.execPath, [script("check-pr.mjs")], { env: { ...cleanEnv, GITHUB_EVENT_PATH: event } }), /Conventional Commit PR title/);
});

test("release manifests require a stable concise version in every file", async (t) => {
  const cwd = await temp(t, "concise-manifests-");
  await writeManifests(cwd, "0.5.1", [{ name: "another", version: "1.0.0" }]);
  await assert.rejects(verifyConditions({}, { cwd }), /Missing stable SemVer version in \.claude-plugin\/marketplace\.json/);
  await writeManifests(cwd, "0.5.1-dev.1");
  await assert.rejects(verifyConditions({}, { cwd }), /Missing stable SemVer version/);
});

test("release CLI rejects bad arguments, dirty checkouts, and missing or mismatched tags", async (t) => {
  const { cwd, git } = await repository(t);
  await assert.rejects(cli(cwd, []), /Usage: node scripts\/release\.mjs --dry-run\|--publish/);
  await assert.rejects(cli(cwd, ["--dry-run", "--publish"]), /Usage/);
  await writeFile(join(cwd, "untracked.txt"), "dirty");
  await assert.rejects(cli(cwd, ["--dry-run"]), /Release checkout must be clean/);
  await rm(join(cwd, "untracked.txt"));
  git("tag", "-d", "v0.5.1");
  await assert.rejects(cli(cwd, ["--dry-run"]), /A stable version tag is required/);
  git("tag", "v0.5.0");
  await assert.rejects(cli(cwd, ["--dry-run"]), /Manifest version 0\.5\.1 does not match v0\.5\.0/);
});

test("release CLI publication requires a repository and a token", async (t) => {
  const { cwd, git } = await repository(t);
  git("commit", "--allow-empty", "-m", "fix: repair the parser");
  await assert.rejects(cli(cwd, ["--publish"]), /GITHUB_REPOSITORY must be owner\/repo/);
  await assert.rejects(cli(cwd, ["--publish"], { GITHUB_REPOSITORY: "not a repo" }), /GITHUB_REPOSITORY must be owner\/repo/);
  await assert.rejects(cli(cwd, ["--publish"], { GITHUB_REPOSITORY: "test/concise" }), /GH_TOKEN or GITHUB_TOKEN is required/);
  assert.equal(git("log", "-1", "--format=%s"), "fix: repair the parser");
});

async function inProcess(t, cwd, responses) {
  const saved = Object.fromEntries(Object.keys(process.env).filter((key) => GITHUB_KEYS.includes(key) || key.startsWith("GIT_")).map((key) => [key, process.env[key]]));
  for (const key of Object.keys(saved)) delete process.env[key];
  process.env.GITHUB_TOKEN = "test-token";
  process.env.GITHUB_REPOSITORY = "test/concise";
  const previous = process.cwd();
  process.chdir(cwd);
  t.after(() => {
    process.chdir(previous);
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    Object.assign(process.env, saved);
  });
  t.mock.method(console, "log", () => {});
  return t.mock.method(globalThis, "fetch", async (url, options = {}) => responses.shift()(url, options));
}

test("release publishes to the default GitHub API with GITHUB_TOKEN", async (t) => {
  const { cwd, git } = await repository(t);
  git("commit", "--allow-empty", "-m", "fix: repair the parser");
  const fetch = await inProcess(t, cwd, [
    () => ({ ok: false, status: 404 }),
    () => ({ ok: true, status: 201, json: async () => ({ html_url: "https://example.test/releases/v0.5.2" }) }),
  ]);
  assert.equal(await release({ dryRun: false }), "0.5.2");
  const calls = fetch.mock.calls.map(({ arguments: [url, options] }) => [url, options.method || "GET", options.headers.Authorization]);
  assert.deepEqual(calls, [
    ["https://api.github.com/repos/test/concise/releases/tags/v0.5.2", "GET", "Bearer test-token"],
    ["https://api.github.com/repos/test/concise/releases", "POST", "Bearer test-token"],
  ]);
  assert.equal(JSON.parse(fetch.mock.calls[1].arguments[1].body).tag_name, "v0.5.2");
  assert.equal(git("log", "-1", "--format=%s"), "chore(release): 0.5.2");
  assert.match(git("ls-remote", "--tags", "origin"), /refs\/tags\/v0\.5\.2/);
  assert.equal(JSON.parse(await readFile(join(cwd, manifestPaths[3]), "utf8")).version, "0.5.2");
  assert.ok(console.log.mock.calls.some(({ arguments: [line] }) => line === "Published https://example.test/releases/v0.5.2"));
});

test("release stops when the GitHub release lookup fails", async (t) => {
  const { cwd, git } = await repository(t);
  git("commit", "--allow-empty", "-m", "feat: add a preset");
  const fetch = await inProcess(t, cwd, [() => ({ ok: false, status: 500 })]);
  await assert.rejects(release({ dryRun: false }), /GitHub release lookup failed: HTTP 500/);
  assert.equal(fetch.mock.calls.length, 1);
});
