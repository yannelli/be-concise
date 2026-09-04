import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkPullRequest } from "../scripts/check-pr.mjs";
import { manifestPaths, prepare, verifyConditions } from "../scripts/release-manifests.mjs";
import { nextVersion, releaseNotes, releaseType } from "../scripts/release.mjs";

test("Conventional Commits select the SemVer bump, including breaking changes before 1.0", () => {
  const cases = [
    ["fix: repair a hook", "patch", "0.5.2"],
    ["perf(parser): reduce scans", "patch", "0.5.2"],
    ["revert: undo a rule", "patch", "0.5.2"],
    ["feat(config): add a preset", "minor", "0.6.0"],
    ["feat(config)!: replace keys", "major", "1.0.0"],
    ["docs: describe migration\n\nBREAKING CHANGE: use the new key", "major", "1.0.0"],
    ["refactor: replace keys\n\nBREAKING-CHANGE: use the new key", "major", "1.0.0"],
    ["chore(release): promote dev to main", null, null],
    ["docs: explain setup", null, null],
    ["Update files", null, null],
  ];
  for (const [message, type, version] of cases) {
    assert.equal(releaseType(message), type, message);
    assert.equal(nextVersion("0.5.1", [{ message }]), version, message);
  }
  assert.equal(nextVersion("2.4.8", [{ message: "fix: repair" }, { message: "feat: add" }]), "2.5.0");
  assert.equal(nextVersion("2.4.8", [{ message: "feat: add" }, { message: "fix!: replace" }]), "3.0.0");
  assert.equal(nextVersion("0.5.1", []), null);
  assert.throws(() => nextVersion("01.0.0", []), /Invalid stable version/);
});

test("release notes include breaking migration details and commit references", () => {
  const notes = releaseNotes("1.0.0", "v0.5.1", [
    { hash: "1234567890", message: "feat!: replace keys\n\nBREAKING CHANGE: rename oldKey to newKey" },
    { hash: "abcdef0123", message: "fix: repair a hook" },
    { hash: "9876543210", message: "ci: check titles" },
  ]);
  assert.match(notes, /rename oldKey to newKey/);
  assert.match(notes, /1234567/);
  assert.match(notes, /fix: repair a hook/);
  assert.doesNotMatch(notes, /ci: check titles/);
});

function pullRequest(title, base = "dev", head = "feature", body = "") {
  const repo = { full_name: "yannelli/be-concise" };
  return { title, body, base: { ref: base, repo }, head: { ref: head, repo } };
}

test("PR checks accept conventional titles and dev promotions", () => {
  for (const title of ["feat: add a rule", "fix(codex): parse replies", "refactor(config)!: remove a key", "docs: describe setup"]) {
    assert.doesNotThrow(() => checkPullRequest(pullRequest(title)));
  }
  assert.doesNotThrow(() => checkPullRequest(pullRequest("chore(release): promote dev to main", "main", "dev")));
});

test("PR checks reject invalid titles and breaking changes hidden in the body", () => {
  for (const title of ["Update files", "feature: add a rule", "fix:", "fix: ", "fix: repair\nfeat: add", "Feat: add a rule"]) {
    assert.throws(() => checkPullRequest(pullRequest(title)), /Conventional Commit/);
  }
  for (const marker of ["BREAKING CHANGE", "BREAKING-CHANGE"]) {
    assert.throws(() => checkPullRequest(pullRequest("refactor: remove a key", "dev", "feature", `${marker}: use the new key`)), /Put !/);
    assert.doesNotThrow(() => checkPullRequest(pullRequest("refactor!: remove a key", "dev", "feature", `${marker}: use the new key`)));
  }
});

test("release PRs must come from this repository's dev branch", () => {
  assert.throws(() => checkPullRequest(pullRequest("fix: repair", "main")), /dev branch/);
  const fork = pullRequest("chore: promote", "main", "dev");
  fork.head.repo = { full_name: "someone/be-concise" };
  assert.throws(() => checkPullRequest(fork), /dev branch/);
});

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), "concise-release-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const path of manifestPaths) {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    const document = path === manifestPaths[0]
      ? { name: "be-concise", plugins: [{ name: "another", version: "9.0.0" }, { name: "concise", version: "0.5.1" }] }
      : { name: "concise", version: "0.5.1", description: "Keep this value" };
    await writeFile(join(cwd, path), JSON.stringify(document));
  }
  return cwd;
}

test("release preparation updates the three versions and preserves other metadata", async (t) => {
  const cwd = await fixture(t);
  await verifyConditions({}, { cwd });
  await prepare({}, { cwd, nextRelease: { version: "0.6.0" } });
  await verifyConditions({}, { cwd });
  for (const path of manifestPaths) {
    const document = JSON.parse(await readFile(join(cwd, path), "utf8"));
    if (document.plugins) {
      assert.equal(document.plugins[0].version, "9.0.0");
      assert.equal(document.plugins[1].version, "0.6.0");
    } else {
      assert.equal(document.version, "0.6.0");
      assert.equal(document.description, "Keep this value");
    }
  }
});

test("release preparation rejects version drift before writing", async (t) => {
  const cwd = await fixture(t);
  await writeFile(join(cwd, manifestPaths[2]), JSON.stringify({ name: "concise", version: "0.5.2" }));
  await assert.rejects(prepare({}, { cwd, nextRelease: { version: "0.6.0" } }), /versions must match/);
  const unchanged = JSON.parse(await readFile(join(cwd, manifestPaths[1]), "utf8"));
  assert.equal(unchanged.version, "0.5.1");
});

test("release preparation rejects malformed and prerelease versions", async (t) => {
  const cwd = await fixture(t);
  for (const version of ["1.0", "v1.0.0", "01.0.0", "1.0.0-dev.1"]) {
    await assert.rejects(prepare({}, { cwd, nextRelease: { version } }), /Invalid stable release version/);
  }
});
