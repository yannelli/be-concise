import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { EXCLUDED, KEPT_ASSETS, PLUGIN, buildTree, included } from "../scripts/directory-tree.mjs";

const execute = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("../scripts/directory-tree.mjs", import.meta.url));
// The directory listing drops relative links, so the plugin README links to GitHub.
const REPO_PLUGIN_URL = "https://github.com/yannelli/be-concise/blob/main/plugins/concise/";

async function temp(t) {
  const directory = await mkdtemp(join(tmpdir(), "concise-directory-tree-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(directory, join(entry.parentPath, entry.name)));
}

const isolated = (home) => ({ ...process.env, HOME: home, USERPROFILE: "", XDG_CONFIG_HOME: "", XDG_STATE_HOME: home, XDG_CACHE_HOME: home, BEC_MONITOR_DISABLED: "1" });

test("the tree leaves out other hosts, the console, tests, and every asset but the icon", () => {
  for (const path of EXCLUDED) {
    assert.equal(included(path), false, path);
    assert.equal(included(`${path}/inner.mjs`), false, path);
  }
  assert.deepEqual(KEPT_ASSETS.map(included), KEPT_ASSETS.map(() => true));
  assert.equal(included("assets/icon-512.png"), false);
  assert.equal(included("assets/geist.woff2"), false);
  assert.equal(included("webhook.mjs"), true);
  assert.equal(included("hooks/check-edit.mjs"), true);
  assert.equal(included("hooks/test-filter.sh"), true);
});

test("buildTree copies the kept plugin files, replaces old contents, and keeps .git", async (t) => {
  const out = await temp(t);
  await mkdir(join(out, ".git"));
  await writeFile(join(out, ".git", "HEAD"), "ref: refs/heads/claude-directory\n");
  await writeFile(join(out, "stale.txt"), "old");
  const files = await buildTree(out);
  const written = (await walk(out)).filter((path) => !path.startsWith(".git/"));
  assert.deepEqual(written.sort(), [...files].sort());
  assert.equal(await readFile(join(out, ".git", "HEAD"), "utf8"), "ref: refs/heads/claude-directory\n");
  for (const path of [".claude-plugin/plugin.json", ".mcp.json", "hooks/hooks.json", "README.md", "LICENSE", "PRIVACY.md", "assets/icon.svg"]) {
    assert.ok(files.includes(path), path);
  }
  assert.ok(files.every(included));
  assert.equal(await readFile(join(out, ".claude-plugin/plugin.json"), "utf8"), await readFile(join(PLUGIN, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal((await stat(join(out, "hooks/test-filter.sh"))).mode, (await stat(join(PLUGIN, "hooks/test-filter.sh"))).mode);
});

test("the tree is self-contained text with no approvals", async (t) => {
  const out = await temp(t);
  const files = await buildTree(out);
  const manifest = JSON.parse(await readFile(join(out, ".claude-plugin/plugin.json"), "utf8"));
  assert.ok(files.includes(manifest.icon.replace(/^\.\//, "")), manifest.icon);
  for (const file of files) {
    const bytes = await readFile(join(out, file));
    assert.ok(!bytes.includes(0) && new TextDecoder("utf-8", { fatal: true }).decode(bytes), `${file} is text`);
    const text = bytes.toString("utf8");
    assert.doesNotMatch(text, /permissionDecision["']?\s*:\s*["']allow/, file);
    for (const [, path] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)) {
      if (file.endsWith(".json")) assert.ok(files.includes(path), `${file} runs ${path}`);
    }
    if (file.endsWith(".mjs")) {
      // The directory scan reads a constant such as KEY or TOKEN as a credential from the user's machine.
      assert.doesNotMatch(text, /\b(?:const|let|var)\s+(?:\w+_)?(?:KEYS?|TOKENS?|SECRETS?|PASSWORDS?)\s*=/, file);
      for (const [, , from, url] of text.matchAll(/(from\s+|import\(\s*)["'](\.{1,2}\/[^"']+)["']|new URL\(\s*["'](\.{1,2}\/[^"']+)["']\s*,\s*import\.meta\.url/g)) {
        const target = relative(out, resolve(out, dirname(file), from || url));
        assert.ok(files.some((path) => path === target || path.startsWith(`${target}/`)), `${file} imports ${from || url}`);
      }
    }
    if (file.endsWith(".md")) {
      const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
      for (const [, link] of prose.matchAll(/\[[^\]\n]*\]\(([^)\s#]+)[^)]*\)/g)) {
        const local = link.startsWith(REPO_PLUGIN_URL) ? link.slice(REPO_PLUGIN_URL.length) : link;
        if (/^[a-z]+:/i.test(local)) continue;
        const target = relative(out, resolve(out, local === link ? dirname(file) : "", local));
        assert.ok(files.some((path) => path === target || path.startsWith(`${target}/`)), `${file} links ${link}`);
      }
    }
  }
});

test("hooks and the MCP server run from the tree", async (t) => {
  const out = await temp(t);
  const home = await temp(t);
  await buildTree(out);
  const event = {
    hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "npm test" }, cwd: home, session_id: "tree-test",
    tool_response: { stdout: "PASS one\nPASS two\n", stderr: "", interrupted: false, isImage: false, noOutputExpected: false },
  };
  const hook = spawnSync(process.execPath, [join(out, "hooks/post-test-filter.mjs")], { input: JSON.stringify(event), encoding: "utf8", env: isolated(home), cwd: home });
  assert.equal(hook.status, 0, hook.stderr);
  assert.match(JSON.parse(hook.stdout).hookSpecificOutput.updatedToolOutput.stdout, /^\[filtered\] runner=js exit=0/);
  const list = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const server = spawnSync(process.execPath, [join(out, "tools/mcp-server.mjs")], { input: `${list}\n`, encoding: "utf8", env: isolated(home), cwd: home });
  assert.equal(server.status, 0, server.stderr);
  assert.ok(JSON.parse(server.stdout.split("\n")[0]).result.tools.length > 0);
});

test("the command line writes the tree and rejects a missing directory", async (t) => {
  const out = await temp(t);
  const { stdout } = await execute(process.execPath, [SCRIPT, out]);
  assert.match(stdout, /^Wrote \d+ files to /);
  await assert.rejects(execute(process.execPath, [SCRIPT]), /Usage: node scripts\/directory-tree\.mjs OUT_DIR/);
});
