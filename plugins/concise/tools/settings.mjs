import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configuration, saveConfiguration, validateConfig, problem } from "../web/configuration.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs", "configuration.md");
export const OPS = ["set", "unset", "add", "remove"];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function readValue(source, key) {
  return key.split(".").reduce((node, part) => (object(node) && part in node ? node[part] : undefined), source);
}

function writeValue(target, key, value) {
  const parts = key.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!object(node[part])) node[part] = {};
    node = node[part];
  }
  node[parts.at(-1)] = value;
}

function dropValue(target, key) {
  const parts = key.split(".");
  const trail = [target];
  for (const part of parts.slice(0, -1)) {
    if (!object(trail.at(-1)[part])) return;
    trail.push(trail.at(-1)[part]);
  }
  delete trail.at(-1)[parts.at(-1)];
  for (let i = trail.length - 1; i > 0; i -= 1) {
    if (Object.keys(trail[i]).length > 0) break;
    delete trail[i - 1][parts[i - 1]];
  }
}

/** Picks a layer by id, or by "project" or "user": the file in effect, else the one a new file goes to. */
export function resolveLayer(state, name = "project", cwd = process.cwd()) {
  const exact = state.layers.find((layer) => layer.id === name);
  if (exact) return exact;
  if (!["project", "user"].includes(name)) throw problem(`Unknown layer ${name}. Use project, user, or one of: ${state.layers.map((l) => l.id).join(", ")}`);
  const group = state.layers.filter((layer) => layer.id.startsWith(name));
  if (group.length === 0) throw problem(`No ${name} layer is available: set HOME or XDG_CONFIG_HOME`);
  const active = group.find((layer) => layer.active);
  if (active) return active;
  if (name === "user") return group[0];
  const override = group.find((layer) => layer.id === "project-override");
  if (override) return override;
  const codexOnly = existsSync(join(cwd, ".codex")) && !existsSync(join(cwd, ".claude"));
  return group.find((layer) => layer.id === (codexOnly ? "project-codex" : "project-claude"));
}

function parseLayer(layer) {
  if (layer.error) throw problem(layer.error);
  if (!layer.exists || layer.text.trim() === "") return {};
  let parsed;
  try { parsed = JSON.parse(layer.text); } catch (err) { throw problem(`${layer.path} is not valid JSON: ${err.message}`); }
  if (!object(parsed)) throw problem(`${layer.path} is not a JSON object`);
  return parsed;
}

const serialize = (config) => `${JSON.stringify(config, null, 2)}\n`;

/** A line diff of two texts, with "+" and "-" prefixes and two lines of context. */
export function lineDiff(before, after) {
  const a = before === "" ? [] : before.replace(/\n$/, "").split("\n");
  const b = after.replace(/\n$/, "").split("\n");
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ mark: " ", text: a[i] });
      i += 1;
      j += 1;
    } else if (i < a.length && (j >= b.length || table[i + 1][j] >= table[i][j + 1])) rows.push({ mark: "-", text: a[i++] });
    else rows.push({ mark: "+", text: b[j++] });
  }
  const near = (index) => rows.slice(Math.max(0, index - 2), index + 3).some((row) => row.mark !== " ");
  return rows.filter((row, index) => near(index)).map((row) => `${row.mark} ${row.text}`).join("\n");
}

function editedLayer(config, { op, key, value }) {
  if (!OPS.includes(op)) throw problem(`op must be one of ${OPS.join(", ")}`);
  if (typeof key !== "string" || !/^[A-Za-z][\w-]*(\.[A-Za-z0-9][\w-]*)*$/.test(key)) throw problem(`Bad key ${JSON.stringify(key)}`);
  const next = structuredClone(config);
  if (op === "unset") dropValue(next, key);
  else if (op === "set") writeValue(next, key, value);
  else {
    const current = readValue(next, key) ?? [];
    if (!Array.isArray(current)) throw problem(`${key} is not a list`);
    const items = Array.isArray(value) ? value : [value];
    const kept = op === "add"
      ? [...current, ...items.filter((item) => !current.some((prior) => same(prior, item)))]
      : current.filter((prior) => !items.some((item) => same(prior, item)));
    writeValue(next, key, kept);
  }
  return next;
}

/** Applies one or more edits to a layer file in memory, validates the result, and returns the preview. */
export function planEdit({ cwd = process.cwd(), env = process.env, layer = "project", edits, transform }) {
  const state = configuration(cwd, env);
  const target = resolveLayer(state, layer, cwd);
  const before = parseLayer(target);
  let after = (edits || []).reduce(editedLayer, before);
  if (transform) after = transform(structuredClone(after));
  validateConfig(after);
  const text = serialize(after);
  return {
    layer: { id: target.id, label: target.label, path: target.path, exists: target.exists },
    revision: target.revision,
    changed: !same(before, after),
    diff: same(before, after) ? "" : lineDiff(target.exists ? serialize(before) : "", text),
    text,
    cwd,
  };
}

/** Writes a planned edit, refusing when the file changed since the plan was made. */
export function applyPlan(plan, env = process.env) {
  if (!plan.changed) return { ...plan, applied: false };
  saveConfiguration(plan.cwd, env, { id: plan.layer.id, text: plan.text, revision: plan.revision });
  return { ...plan, applied: true, effective: configuration(plan.cwd, env).effective };
}

/** Plans an edit and writes it only when `apply` is true. */
export function editSettings({ apply = false, env = process.env, ...options }) {
  const plan = planEdit({ ...options, env });
  return apply ? applyPlan(plan, env) : { ...plan, applied: false };
}

/** The effective config, every layer, the env overrides, and load problems. */
export function showSettings({ cwd = process.cwd(), env = process.env } = {}) {
  const state = configuration(cwd, env);
  const { problems, ...effective } = state.effective;
  return {
    cwd,
    effective,
    problems,
    layers: state.layers.map(({ id, label, path, exists, active }) => ({ id, label, path, exists, active })),
    environment: state.environment,
  };
}

/** One key: its default, the effective value, and the value each existing layer file sets. */
export function getSetting({ cwd = process.cwd(), env = process.env, key }) {
  const state = configuration(cwd, env);
  const layers = state.layers.filter((layer) => layer.exists).map((layer) => {
    try { return { id: layer.id, path: layer.path, value: readValue(parseLayer(layer), key) }; } catch (err) { return { id: layer.id, path: layer.path, error: err.message }; }
  });
  const doc = settingKeys().find((row) => row.key === key);
  return { key, default: readValue(state.defaults, key), effective: readValue(state.effective, key), layers, ...(doc ? { description: doc.description } : {}) };
}

/** Parses every existing layer file and runs the console's validation on each. */
export function validateSettings({ cwd = process.cwd(), env = process.env } = {}) {
  const state = configuration(cwd, env);
  const layers = state.layers.filter((layer) => layer.exists).map((layer) => {
    try {
      validateConfig(parseLayer(layer));
      return { id: layer.id, path: layer.path, ok: true };
    } catch (err) {
      return { id: layer.id, path: layer.path, ok: false, error: err.message };
    }
  });
  const problems = state.effective.problems;
  return { ok: layers.every((layer) => layer.ok) && problems.length === 0, layers, problems };
}

/** Rows of the key table in docs/configuration.md, filtered by a case-insensitive query. */
export function settingKeys(query = "") {
  if (!existsSync(DOCS)) return [];
  const needle = String(query).toLowerCase();
  return readFileSync(DOCS, "utf8").split("\n")
    .map((line) => /^\| `([^`]+)` \| (.+?) \| (.+?) \|$/.exec(line))
    .filter(Boolean)
    .map(([, key, defaultText, description]) => ({ key, default: defaultText.replace(/`/g, ""), description }))
    .filter((row) => !needle || `${row.key} ${row.description}`.toLowerCase().includes(needle));
}

/** Merges a partial config into a layer object: objects merge, lists union, other values replace. */
export function mergeDelta(target, delta) {
  for (const [key, value] of Object.entries(delta)) {
    if (object(value)) target[key] = mergeDelta(object(target[key]) ? target[key] : {}, value);
    else if (Array.isArray(value) && Array.isArray(target[key])) target[key] = [...target[key], ...value.filter((item) => !target[key].some((prior) => same(prior, item)))];
    else target[key] = structuredClone(value);
  }
  return target;
}
