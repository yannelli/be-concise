import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { userPatternsDir, validatePack } from "../hooks/lib/packs.mjs";
import { configuration, saveConfiguration, problem } from "./configuration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const RELEASES_URL = "https://api.github.com/repos/yannelli/be-concise/releases/latest";
const FETCH_LIMIT = 2 * 1024 * 1024;
const FETCH_TIMEOUT = 10000;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
const uniq = (items) => [...new Set(items)];
const inside = (path, dir) => path === dir || path.startsWith(dir + sep);

export function packTargets(cwd, env) {
  const user = userPatternsDir(env);
  const layers = configuration(cwd, env).layers;
  const userLayer = layers.find((layer) => layer.id.startsWith("user"))?.id || null;
  return [
    { id: "project", label: "Project", dir: join(cwd, ".claude", "concise", "patterns"), lock: join(cwd, ".claude", "concise", "packs.json"), layer: "project-claude" },
    ...(user && userLayer ? [{ id: "user", label: "User", dir: user, lock: join(dirname(user), "packs.json"), layer: userLayer }] : []),
  ];
}

function readLock(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return object(value) ? value : {};
  } catch { return {}; }
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, text.endsWith("\n") ? text : `${text}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

function writeLock(path, lock) {
  if (Object.keys(lock).length === 0) rmSync(path, { force: true });
  else writeAtomic(path, JSON.stringify(lock, null, 2));
}

/** Installed pack sources, keyed by pack id, for the console badges. */
export function packSources(cwd, env) {
  const sources = {};
  for (const target of packTargets(cwd, env)) {
    for (const [id, entry] of Object.entries(readLock(target.lock))) {
      if (object(entry) && typeof entry.url === "string") sources[id] = { url: entry.url, updatedAt: entry.updatedAt || null, target: target.id };
    }
  }
  return sources;
}

function allowedUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { return null; }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return url.protocol === "https:" || (url.protocol === "http:" && loopback) ? url : null;
}

async function fetchText(url, accept) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT), redirect: "follow", headers: { Accept: accept, "User-Agent": "concise-web" } });
  } catch (err) { throw problem(`${url} could not be fetched: ${err.cause?.message || err.message}`, 502); }
  if (!response.ok) throw problem(`${url} returned ${response.status}`, 502);
  if (Number(response.headers.get("content-length") || 0) > FETCH_LIMIT) throw problem(`${url} exceeds 2 MiB`, 413);
  const text = await response.text();
  if (Buffer.byteLength(text) > FETCH_LIMIT) throw problem(`${url} exceeds 2 MiB`, 413);
  return text;
}

function parsePack(text, where) {
  let raw;
  try { raw = JSON.parse(text); } catch (err) { throw problem(`${where} is not valid JSON: ${err.message}`); }
  const check = validatePack(raw);
  if (!check.ok) throw problem(`${where} is not a valid pack: ${check.reason}`);
  return raw;
}

function packFile(target, id, replace) {
  if (existsSync(join(target.dir, `${id}.mjs`))) throw problem(`${id}.mjs already exists in ${target.dir}`, 409);
  const path = join(target.dir, `${id}.json`);
  if (existsSync(path) && !replace) throw problem(`${path} already exists. Remove it first.`, 409);
  return path;
}

async function installUrl(target, url, expectedId = null) {
  const text = await fetchText(url, "application/json");
  const raw = parsePack(text, url.href);
  if (expectedId && raw.id !== expectedId) throw problem(`${url.href} now holds pack ${raw.id}, expected ${expectedId}`);
  const lock = readLock(target.lock);
  const path = packFile(target, raw.id, Boolean(lock[raw.id]));
  writeAtomic(path, text);
  lock[raw.id] = { url: url.href, sha256: sha256(text), updatedAt: new Date().toISOString() };
  writeLock(target.lock, lock);
  return { id: raw.id, path, url: url.href, target: target.id };
}

function installText(target, text) {
  const raw = parsePack(text, "The pasted pack");
  const path = packFile(target, raw.id, false);
  writeAtomic(path, JSON.stringify(raw, null, 2));
  return { id: raw.id, path, target: target.id };
}

function editLayer(cwd, env, id, edit) {
  const layer = configuration(cwd, env).layers.find((item) => item.id === id);
  if (!layer) throw problem("Unknown configuration layer");
  let config = {};
  if (layer.exists) {
    try { config = JSON.parse(layer.text); } catch (err) { throw problem(`${layer.path} is not valid JSON: ${err.message}`); }
    if (!object(config)) throw problem(`${layer.path} is not a JSON object`);
  }
  edit(config);
  saveConfiguration(cwd, env, { id, text: JSON.stringify(config, null, 2), revision: layer.revision });
  return layer;
}

function aiOf(config) {
  if (!object(config.features)) config.features = {};
  if (!object(config.features.aiWriting)) config.features.aiWriting = {};
  return config.features.aiWriting;
}

function prune(ai) {
  for (const key of ["excludePacks", "enablePatterns", "disablePatterns", "packs"]) if (Array.isArray(ai[key]) && ai[key].length === 0) delete ai[key];
}

function addPath(cwd, env, layerId, source) {
  const path = isAbsolute(source) ? source : resolve(cwd, source);
  if (!existsSync(path)) throw problem(`No such file or directory: ${path}`);
  if (!statSync(path).isDirectory() && !/\.(json|mjs)$/.test(path)) throw problem("A pack path must be a .json or .mjs file or a directory");
  const layer = editLayer(cwd, env, layerId, (config) => {
    const ai = aiOf(config);
    ai.packs = uniq([...strings(ai.packs), source]);
  });
  return { path, layer: layer.id };
}

export async function addPack({ cwd, env, source, text, target: targetId = "project" }) {
  const target = packTargets(cwd, env).find((item) => item.id === targetId);
  if (!target) throw problem("Unknown pack target");
  if (typeof text === "string" && text.trim()) return installText(target, text);
  const given = typeof source === "string" ? source.trim() : "";
  if (!given) throw problem("Provide a pack URL, a pack path, or pack JSON");
  if (!/^https?:\/\//i.test(given)) return addPath(cwd, env, target.layer, given);
  const url = allowedUrl(given);
  if (!url) throw problem("Pack URLs must use https, or http on localhost");
  if (/\.mjs$/i.test(url.pathname)) throw problem("A .mjs pack runs code inside the hook. Download it, read it, then add its path.");
  return installUrl(target, url);
}

export async function removePack({ cwd, env, id, catalog }) {
  if (typeof id !== "string") throw problem("id is required");
  const pack = (await catalog(cwd, configuration(cwd, env).effective)).packs.find((item) => item.id === id);
  if (!pack) throw problem(`Unknown pack ${id}`, 404);
  const target = packTargets(cwd, env).find((item) => inside(pack.path, item.dir));
  if (!target) throw problem(`${pack.path} is outside the project and user pack directories. Remove it by hand.`);
  rmSync(pack.path, { force: true });
  const lock = readLock(target.lock);
  delete lock[id];
  writeLock(target.lock, lock);
  return { id, path: pack.path, target: target.id };
}

function blockers(cwd, env, layerId, id) {
  const found = configuration(cwd, env).layers.filter((layer) => layer.id !== layerId && layer.exists && layer.text.includes(JSON.stringify(id))).map((layer) => layer.label);
  const vars = Object.keys(env).filter((key) => /^BEC_(ALWAYS_)?(DISABLE_PATTERNS|ENABLE_PATTERNS|FEATURE_(ALWAYS_)?DISABLE|CONFIG_JSON)$/.test(key));
  return [...found, ...vars];
}

export async function togglePack({ cwd, env, id, enabled, target: targetId = "project", catalog }) {
  if (typeof id !== "string" || typeof enabled !== "boolean") throw problem("id and enabled are required");
  const layer = packTargets(cwd, env).find((item) => item.id === targetId)?.layer;
  if (!layer) throw problem("Unknown pack target");
  const before = configuration(cwd, env).effective;
  const pack = (await catalog(cwd, before)).packs.find((item) => item.id === id);
  if (!pack) throw problem(`Unknown pack ${id}`, 404);
  const without = (items, ...drop) => strings(items).filter((item) => !drop.includes(item));
  if (pack.feature === "emDash") {
    editLayer(cwd, env, layer, (config) => {
      if (!object(config.features)) config.features = {};
      config.features.emDash = { ...(object(config.features.emDash) ? config.features.emDash : {}), enabled };
    });
  } else {
    editLayer(cwd, env, layer, (config) => {
      const ai = aiOf(config);
      if (enabled) {
        ai.excludePacks = without(ai.excludePacks, id);
        ai.disablePatterns = without(ai.disablePatterns, id, pack.categoryId);
        if (!before.features.aiWriting.enabled) ai.enabled = true;
      } else {
        ai.excludePacks = uniq([...strings(ai.excludePacks), id]);
        ai.enablePatterns = without(ai.enablePatterns, id);
      }
      prune(ai);
    });
    if (enabled && !(await catalog(cwd, configuration(cwd, env).effective)).packs.find((item) => item.id === id)?.active) {
      editLayer(cwd, env, layer, (config) => {
        const ai = aiOf(config);
        ai.enablePatterns = uniq([...strings(ai.enablePatterns), id]);
      });
    }
  }
  const active = Boolean((await catalog(cwd, configuration(cwd, env).effective)).packs.find((item) => item.id === id)?.active);
  const still = active === enabled ? [] : blockers(cwd, env, layer, id);
  const warning = active === enabled ? null
    : `${id} is still ${active ? "active" : "inactive"} after saving. ${still.length ? `Check ${still.join(", ")}.` : "Check the other configuration layers and the BEC_ environment overrides."}`;
  return { id, enabled, active, target: targetId, layer, warning };
}

function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta) return delta;
  }
  return 0;
}

async function checkRelease(releasesUrl) {
  const version = JSON.parse(readFileSync(resolve(HERE, "../.claude-plugin/plugin.json"), "utf8")).version;
  const result = { version, latest: null, url: null, updateAvailable: false, error: null };
  try {
    const release = JSON.parse(await fetchText(new URL(releasesUrl), "application/vnd.github+json"));
    result.latest = String(release.tag_name || "").replace(/^v/, "") || null;
    result.url = typeof release.html_url === "string" ? release.html_url : null;
    result.updateAvailable = Boolean(result.latest) && compareVersions(result.latest, version) > 0;
  } catch (err) { result.error = err.message; }
  return result;
}

export async function checkUpdates({ cwd, env, releasesUrl = RELEASES_URL }) {
  const packs = [];
  for (const target of packTargets(cwd, env)) {
    for (const [id, entry] of Object.entries(readLock(target.lock))) {
      const row = { id, target: target.id, url: entry.url, path: join(target.dir, `${id}.json`), updatedAt: entry.updatedAt || null, changed: false, error: null };
      try {
        const url = allowedUrl(entry.url);
        if (!url) throw problem("URL must use https, or http on localhost");
        const text = await fetchText(url, "application/json");
        parsePack(text, entry.url);
        row.changed = sha256(text) !== entry.sha256;
      } catch (err) { row.error = err.message; }
      packs.push(row);
    }
  }
  return { checkedAt: new Date().toISOString(), plugin: await checkRelease(releasesUrl), packs };
}

export async function updatePack({ cwd, env, id, target: targetId }) {
  const target = packTargets(cwd, env).find((item) => item.id === targetId);
  if (!target) throw problem("Unknown pack target");
  const entry = readLock(target.lock)[id];
  if (!object(entry) || typeof entry.url !== "string") throw problem(`${id} was not installed from a URL`, 404);
  const url = allowedUrl(entry.url);
  if (!url) throw problem("URL must use https, or http on localhost");
  return installUrl(target, url, id);
}
