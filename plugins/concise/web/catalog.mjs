import { loadPacks, resolveActive } from "../hooks/lib/packs.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { cwd, config } = JSON.parse(input);
const loaded = await loadPacks({ cwd, config });
const active = new Map(resolveActive({ ...loaded, config }).packs.map((pack) => [pack.id, pack]));
const packs = loaded.packs.map((pack) => ({
  id: pack.id, feature: pack.feature, categoryId: pack.categoryId, category: pack.category,
  scope: pack.scope, builtin: pack.builtin, path: pack.path, tags: pack.tags, presets: pack.presets,
  active: pack.feature === "emDash" ? config.features.emDash.enabled : config.features.aiWriting.enabled && active.has(pack.id),
  options: active.get(pack.id)?.options || pack.options,
  patterns: pack.patterns, scripted: Boolean(pack.detect),
}));
process.stdout.write(JSON.stringify({ packs, categories: loaded.categories, presets: loaded.presets, problems: loaded.problems },
  (_key, value) => value instanceof RegExp ? value.source : value));
