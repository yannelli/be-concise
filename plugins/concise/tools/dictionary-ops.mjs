import { createHash } from "node:crypto";
import { configuration, problem } from "../web/configuration.mjs";
import { compileEntry, entryProblem, scanDictionary, HOOKS } from "../hooks/lib/dictionary.mjs";
import { SCOPES } from "../hooks/lib/packs.mjs";
import { editSettings, readValue } from "./settings.mjs";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const LIST_FIELDS = { hooks: HOOKS, scopes: SCOPES };

function layerEntries(layer) {
  try {
    const entries = readValue(JSON.parse(layer.text), "features.dictionary.entries");
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

/** A readable id from the entry value, with a short hash when the value has no letters or digits. */
export function entryId(value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || `entry-${createHash("sha256").update(String(value)).digest("hex").slice(0, 6)}`;
}

/** Fills in the id and splits comma lists, so CLI flags and MCP arguments share one shape. */
export function normalizeEntry(raw) {
  if (!object(raw)) throw problem("entry must be an object");
  const entry = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  for (const field of Object.keys(LIST_FIELDS)) {
    if (typeof entry[field] === "string") entry[field] = entry[field].split(",").map((item) => item.trim()).filter(Boolean);
  }
  const id = entry.id || (typeof entry.value === "string" ? entryId(entry.value) : undefined);
  const ordered = { id, ...entry };
  const reason = entryProblem(ordered);
  if (reason) throw problem(`Dictionary entry ${id ? `"${id}" ` : ""}is invalid: ${reason}`);
  return ordered;
}

/** The effective entries, each with the layer that sets it and any reason the hooks skip it. */
export function listDictionary({ cwd = process.cwd(), env = process.env } = {}) {
  const state = configuration(cwd, env);
  const active = state.layers.filter((layer) => layer.active);
  const { enabled, mode, entries } = state.effective.features.dictionary;
  return {
    enabled,
    mode,
    entries: entries.map((entry) => {
      const owner = [...active].reverse().find((layer) => layerEntries(layer).some((item) => item?.id === entry?.id));
      const reason = entryProblem(entry);
      return { ...entry, layer: owner ? owner.id : "environment", ...(reason ? { problem: reason } : {}) };
    }),
  };
}

function entriesOf(config) {
  if (!object(config.features)) config.features = {};
  if (!object(config.features.dictionary)) config.features.dictionary = {};
  if (!Array.isArray(config.features.dictionary.entries)) config.features.dictionary.entries = [];
  return config.features.dictionary.entries;
}

function prune(config) {
  const dictionary = config.features.dictionary;
  if (dictionary.entries.length === 0) delete dictionary.entries;
  if (Object.keys(dictionary).length === 0) delete config.features.dictionary;
  if (Object.keys(config.features).length === 0) delete config.features;
  return config;
}

function notes(cwd, env) {
  const { enabled } = configuration(cwd, env).effective.features.dictionary;
  return enabled ? [] : ["features.dictionary.enabled is false in the effective config, so the hooks skip every entry."];
}

/** Adds an entry to a layer file. An existing id needs `replace`. Writes only when `apply` is true. */
export function addEntry({ cwd = process.cwd(), env = process.env, layer = "project", entry, replace = false, apply = false }) {
  const normalized = normalizeEntry(entry);
  const result = editSettings({
    cwd, env, layer, apply,
    transform: (config) => {
      const entries = entriesOf(config);
      const at = entries.findIndex((item) => item?.id === normalized.id);
      if (at !== -1 && !replace) throw problem(`Entry "${normalized.id}" is already in this layer. Pass replace to overwrite it.`);
      if (at === -1) entries.push(normalized);
      else entries[at] = normalized;
      return config;
    },
  });
  return { ...result, entry: normalized, notes: notes(cwd, env) };
}

/** Removes an entry from a layer file, or with `disable` switches off an entry another layer sets. */
export function removeEntry({ cwd = process.cwd(), env = process.env, layer = "project", id, disable = false, apply = false }) {
  if (typeof id !== "string" || id === "") throw problem("id is required");
  const result = editSettings({
    cwd, env, layer, apply,
    transform: (config) => {
      const entries = entriesOf(config);
      const at = entries.findIndex((item) => item?.id === id);
      if (disable) {
        if (at === -1) entries.push({ id, enabled: false });
        else entries[at] = { id, enabled: false };
        return config;
      }
      if (at === -1) {
        const owner = listDictionary({ cwd, env }).entries.find((item) => item.id === id)?.layer;
        const where = owner ? ` It comes from ${owner}; pass disable to switch it off from this layer.` : "";
        throw problem(`Entry "${id}" is not in this layer.${where}`);
      }
      entries.splice(at, 1);
      return prune(config);
    },
  });
  return { ...result, id };
}

/** Runs one entry over sample text without saving it. */
export function testEntry({ entry, text, scope = "reply", hook = null }) {
  const normalized = normalizeEntry({ ...entry, enabled: true });
  delete normalized.enabled;
  if (scope && !SCOPES.includes(scope)) throw problem(`scope must be one of ${SCOPES.join(", ")}`);
  if (hook && !HOOKS.includes(hook)) throw problem(`hook must be one of ${HOOKS.join(", ")}`);
  const matches = scanDictionary(String(text ?? ""), [compileEntry(normalized)], { hook, scope });
  return { entry: normalized, scope, hook, matches };
}
