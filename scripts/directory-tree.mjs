import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The claude-directory branch holds this tree at its root, so Anthropic's directory reads only the Claude plugin.
export const PLUGIN = fileURLToPath(new URL("../plugins/concise/", import.meta.url));

const CODEX = [".codex-plugin", ".codex-mcp.json", "hooks/codex.json"];
const OMP = ["omp", "package.json"];
const TEST_COMMAND_REWRITE = ["hooks/monitor-filter.mjs", "hooks/PreToolUse-test-filter.sh"];
const NPM_CONSOLE = ["web"];
const PLUGIN_TESTS = ["test"];
export const EXCLUDED = [...CODEX, ...OMP, ...TEST_COMMAND_REWRITE, ...NPM_CONSOLE, ...PLUGIN_TESTS];
/** The listing reads `icon` from plugin.json. Every other asset belongs to the console or to Codex. */
export const KEPT_ASSETS = ["assets/icon.svg"];

export function included(path) {
  if (EXCLUDED.some((item) => path === item || path.startsWith(`${item}/`))) return false;
  return !path.startsWith("assets/") || KEPT_ASSETS.includes(path);
}

/** Replaces everything in `out` except `.git` with the tracked plugin files the tree keeps, and returns their paths. */
export async function buildTree(out, plugin = PLUGIN) {
  const files = execFileSync("git", ["ls-files", "-z", "--", "."], { cwd: plugin, encoding: "utf8" })
    .split("\0").filter(Boolean).filter(included);
  await mkdir(out, { recursive: true });
  for (const entry of await readdir(out)) {
    if (entry !== ".git") await rm(join(out, entry), { recursive: true, force: true });
  }
  for (const file of files) {
    await mkdir(dirname(join(out, file)), { recursive: true });
    await copyFile(join(plugin, file), join(out, file));
    await chmod(join(out, file), (await stat(join(plugin, file))).mode);
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error("Usage: node scripts/directory-tree.mjs OUT_DIR");
  const files = await buildTree(resolve(args[0]));
  console.log(`Wrote ${files.length} files to ${args[0]}`);
}
