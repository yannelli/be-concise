import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { coverage } from "../scripts/coverage.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/coverage.mjs", import.meta.url));

const FILES = {
  "src/full.mjs": "export const one = 1;\n",
  "src/partial.mjs": "export const used = () => 1;\n\nexport function unused() {\n  const value = 2;\n  return value; // coverage-ignore: fixture\n}\n",
  "src/unloaded.mjs": "// A comment line.\nexport const two = 2;\n",
  "test/some.mjs": "import \"../src/full.mjs\";\nimport { used } from \"../src/partial.mjs\";\nused();\n",
  "test/all.mjs": "import \"./some.mjs\";\nimport \"../src/unloaded.mjs\";\nimport { unused } from \"../src/partial.mjs\";\nunused();\n",
};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "concise-coverage-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const [path, text] of Object.entries(FILES)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
  const collect = (name, entry) => {
    const dir = join(root, name);
    execFileSync(process.execPath, [join(root, "test", entry)], { env: { ...process.env, NODE_V8_COVERAGE: dir } });
    return dir;
  };
  const gate = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: "utf8" });
  return { root, collect, gate };
}

test("the gate lists lines that never ran and files that never loaded, then exits 1", async (t) => {
  const { root, collect, gate } = await fixture(t);
  const dir = collect("cov-some", "some.mjs");
  await writeFile(join(dir, "broken.json"), "{");
  const result = gate(dir);
  assert.equal(result.stdout, "src/partial.mjs: lines 4\nsrc/unloaded.mjs: never loaded\nLine coverage 60.00% (3/5)\n");
  assert.equal(result.status, 1);
  assert.deepEqual(coverage(root, dir), { lines: 5, missed: 2, files: [
    { path: "src/partial.mjs", loaded: true, lines: 3, missed: [4] },
    { path: "src/unloaded.mjs", loaded: false, lines: 1, missed: [2] },
  ] });
});

test("the gate exits 0 when every source line ran", async (t) => {
  const { collect, gate } = await fixture(t);
  const result = gate(collect("cov-all", "all.mjs"));
  assert.equal(result.stdout, "Line coverage 100.00% (5/5)\n");
  assert.equal(result.status, 0);
});

test("the gate joins neighboring lines into ranges and handles a tree without sources", async (t) => {
  const { root, collect, gate } = await fixture(t);
  await writeFile(join(root, "src/partial.mjs"), "export const used = () => 1;\nexport function unused() {\n  const a = 1;\n  const b = 2;\n\n  if (a) {\n    return b;\n  }\n  return a;\n}\n");
  assert.match(gate(collect("cov-ranges", "some.mjs")).stdout, /^src\/partial\.mjs: lines 3-4,6-7,9\n/);
  for (const path of Object.keys(FILES).filter((name) => name.startsWith("src/"))) await rm(join(root, path));
  const empty = gate(join(root, "cov-ranges"));
  assert.deepEqual([empty.stdout, empty.status], ["Line coverage 100.00% (0/0)\n", 0]);
});

test("the gate needs a coverage directory", async (t) => {
  const { gate } = await fixture(t);
  const result = gate();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^Usage: node scripts\/coverage\.mjs DIR/);
});
