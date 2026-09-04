import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const manifestPaths = [
  ".claude-plugin/marketplace.json",
  "plugins/concise/.claude-plugin/plugin.json",
  "plugins/concise/.codex-plugin/plugin.json",
];

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function readManifests(cwd) {
  return Promise.all(manifestPaths.map(async (path) => {
    const source = await readFile(join(cwd, path), "utf8");
    const document = JSON.parse(source);
    const manifest = path === manifestPaths[0]
      ? document.plugins.find((plugin) => plugin.name === "concise")
      : document;
    if (!manifest || !stableVersion.test(manifest.version)) {
      throw new Error(`Missing stable SemVer version in ${path}`);
    }
    return { path, document, manifest };
  }));
}

export async function verifyConditions(_config, { cwd }) {
  const manifests = await readManifests(cwd);
  if (new Set(manifests.map(({ manifest }) => manifest.version)).size !== 1) {
    throw new Error("Plugin and marketplace versions must match");
  }
}

export async function prepare(_config, { cwd, nextRelease: { version } }) {
  if (!stableVersion.test(version)) {
    throw new Error(`Invalid stable release version: ${version}`);
  }
  await verifyConditions({}, { cwd });
  const manifests = await readManifests(cwd);
  for (const { path, document, manifest } of manifests) {
    manifest.version = version;
    await writeFile(join(cwd, path), `${JSON.stringify(document, null, 4)}\n`);
  }
}
