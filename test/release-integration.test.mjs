import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { manifestPaths } from "../scripts/release-manifests.mjs";

const execute = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/release.mjs", import.meta.url));

async function repository(t) {
  const root = await mkdtemp(join(tmpdir(), "concise-release-git-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "checkout");
  const remote = join(root, "origin.git");
  await mkdir(cwd);
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--bare", remote);
  git("init", "-b", "main");
  git("config", "user.name", "Release test");
  git("config", "user.email", "release@example.test");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  for (const path of manifestPaths) {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    const manifest = { name: "concise", version: "0.5.1" };
    const document = path === manifestPaths[0] ? { plugins: [manifest] } : manifest;
    await writeFile(join(cwd, path), JSON.stringify(document));
  }
  git("add", ".");
  git("commit", "-m", "chore: initial fixture");
  git("tag", "v0.5.1");
  git("branch", "dev");
  git("remote", "add", "origin", remote);
  git("push", "origin", "main", "dev", "--tags");
  return { cwd, git };
}

test("dry-run calculates a release without changing files, commits, or tags", async (t) => {
  const { cwd, git } = await repository(t);
  git("commit", "--allow-empty", "-m", "feat: add a preset");
  const head = git("rev-parse", "HEAD");
  const result = await execute(process.execPath, [script, "--dry-run"], { cwd });
  assert.match(result.stdout, /# 0\.6\.0/);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.equal(git("status", "--porcelain"), "");
  assert.equal(git("tag", "--list"), "v0.5.1");
  git("checkout", "dev");
  await assert.rejects(execute(process.execPath, [script, "--dry-run"], { cwd }), /Releases run from main/);
});

test("publication retries repair an existing tag without bumping again and dev accepts the release merge", async (t) => {
  const { cwd, git } = await repository(t);
  git("commit", "--allow-empty", "-m", "fix: repair the parser");
  git("push", "origin", "main");
  let published;
  let attempts = 0;
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, "Bearer test-token");
    if (request.method === "GET") {
      assert.equal(request.url, "/repos/test/concise/releases/tags/v0.5.2");
      response.writeHead(published ? 200 : 404, { "Content-Type": "application/json" });
      response.end(JSON.stringify(published || { message: "Not Found" }));
      return;
    }
    assert.equal(request.url, "/repos/test/concise/releases");
    assert.equal(request.method, "POST");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks));
    assert.equal(payload.tag_name, "v0.5.2");
    assert.equal(payload.prerelease, false);
    assert.match(payload.body, /fix: repair the parser/);
    attempts += 1;
    if (attempts === 1) {
      response.writeHead(500);
      response.end("temporary failure");
      return;
    }
    published = { ...payload, html_url: "https://example.test/releases/v0.5.2" };
    response.writeHead(201, { "Content-Type": "application/json" });
    response.end(JSON.stringify(published));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const env = {
    ...process.env,
    GH_TOKEN: "test-token",
    GITHUB_REPOSITORY: "test/concise",
    GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
  };
  const publish = () => execute(process.execPath, [script, "--publish"], { cwd, env });
  await assert.rejects(publish(), /HTTP 500/);
  assert.equal(git("log", "-1", "--format=%s"), "chore(release): 0.5.2");
  assert.equal(git("rev-parse", "origin/main"), git("rev-parse", "v0.5.2^{}"));
  assert.match(git("ls-remote", "--tags", "origin"), /refs\/tags\/v0\.5\.2/);
  const head = git("rev-parse", "HEAD");
  await publish();
  assert.equal(attempts, 2);
  await publish();
  assert.equal(attempts, 2);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.equal(git("tag", "--list").split("\n").length, 2);
  for (const path of manifestPaths) {
    const document = JSON.parse(await readFile(join(cwd, path), "utf8"));
    assert.equal((document.plugins?.[0] || document).version, "0.5.2");
  }
  git("checkout", "dev");
  git("commit", "--allow-empty", "-m", "feat: next development change");
  git("merge", "--no-ff", "main", "-m", "chore(release): sync main into dev");
  assert.equal(git("merge-base", "--is-ancestor", "main", "dev"), "");
  assert.equal(JSON.parse(await readFile(join(cwd, manifestPaths[1]), "utf8")).version, "0.5.2");
});
