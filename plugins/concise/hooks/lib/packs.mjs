import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, isAbsolute, resolve, basename, extname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BUILTIN_DIR = join(HERE, "patterns");
const PRESETS_FILE = join(BUILTIN_DIR, "presets.json");

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const FEATURES = ["aiWriting", "emDash"];
export const SCOPES = ["files", "comments", "gh", "commit", "command", "reply"];
export const DEFAULT_SCOPE = SCOPES.filter((s) => s !== "command");
const KINDS = ["phrase", "opening", "regex"];

const AI_DEFAULTS = {
  preset: "default",
  categories: null,
  allow: [],
  packs: [],
  excludePacks: [],
  enablePatterns: [],
  disablePatterns: [],
  options: {},
};

const list = (v) => (Array.isArray(v) ? v : []);
const widen = (s) => s.replace(/'/g, "['’]");

/** The new aiWriting keys with their defaults, so config.mjs does not have to carry them yet. */
export function aiConfig(config) {
  const given = ((config || {}).features || {}).aiWriting || {};
  const options = given.options && typeof given.options === "object" ? given.options : {};
  return {
    ...AI_DEFAULTS,
    ...given,
    allow: list(given.allow),
    packs: list(given.packs),
    excludePacks: list(given.excludePacks),
    enablePatterns: list(given.enablePatterns),
    disablePatterns: list(given.disablePatterns),
    options,
  };
}

// The scanner walks lastIndex, so a pattern without the g flag would never advance.
const global = (flags) => (flags.includes("g") ? flags : `${flags}g`);

export function compilePattern(entry) {
  const tier = entry.tier === 2 ? 2 : 1;
  if (typeof entry.phrase === "string") return { ...entry, tier, re: new RegExp(`\\b(?:${widen(entry.phrase)})\\b`, "gi") };
  if (typeof entry.opening === "string") {
    return { ...entry, tier, re: new RegExp(`(?<=^|[.!?]\\s+)(?:${widen(entry.opening)})`, "gim") };
  }
  return { ...entry, tier, re: new RegExp(entry.regex, global(entry.flags || "gi")) };
}

function patternProblem(entry, i) {
  const at = `pattern ${i}`;
  if (!entry || typeof entry !== "object") return `${at} is not an object`;
  const kinds = KINDS.filter((k) => typeof entry[k] === "string" && entry[k] !== "");
  if (kinds.length !== 1) return `${at} needs exactly one of phrase, opening, regex`;
  if (typeof entry.fix !== "string" || entry.fix === "") return `${at} needs a fix`;
  if (entry.tier !== undefined && entry.tier !== 1 && entry.tier !== 2) return `${at} has a bad tier`;
  try {
    compilePattern(entry);
  } catch (err) {
    return `${at} does not compile: ${err.message}`;
  }
  return null;
}

function categoryProblem(cat) {
  if (typeof cat === "string") return ID_RE.test(cat) ? null : `bad category id ${cat}`;
  if (!cat || typeof cat !== "object") return "category must be a string or an object";
  if (typeof cat.id !== "string" || !ID_RE.test(cat.id)) return "category needs an id";
  if (typeof cat.label !== "string" || cat.label === "") return "category needs a label";
  return null;
}

/** Returns { ok: true } or { ok: false, reason }. `path` also fixes the expected id. */
export function validatePack(raw, path) {
  const bad = (reason) => ({ ok: false, reason });
  if (!raw || typeof raw !== "object") return bad("no default export object");
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) return bad(`bad id ${JSON.stringify(raw.id ?? null)}`);
  if (path && raw.id !== basename(path, extname(path))) return bad(`id ${raw.id} does not match the file name`);
  if (!FEATURES.includes(raw.feature)) return bad(`bad feature ${JSON.stringify(raw.feature ?? null)}`);
  const catReason = categoryProblem(raw.category);
  if (catReason) return bad(catReason);
  if (raw.scope !== undefined) {
    if (!Array.isArray(raw.scope)) return bad("scope must be an array");
    const unknown = raw.scope.find((s) => !SCOPES.includes(s));
    if (unknown) return bad(`unknown scope ${unknown}`);
  }
  if (raw.presets !== undefined && !Array.isArray(raw.presets)) return bad("presets must be an array");
  if (raw.tags !== undefined && !Array.isArray(raw.tags)) return bad("tags must be an array");
  if (raw.options !== undefined && (typeof raw.options !== "object" || raw.options === null || Array.isArray(raw.options))) {
    return bad("options must be an object");
  }
  if (raw.detect !== undefined && typeof raw.detect !== "function") return bad("detect must be a function");
  const patterns = raw.patterns === undefined ? [] : raw.patterns;
  if (!Array.isArray(patterns)) return bad("patterns must be an array");
  if (patterns.length === 0 && typeof raw.detect !== "function") return bad("no patterns and no detect");
  for (let i = 0; i < patterns.length; i += 1) {
    const reason = patternProblem(patterns[i], i);
    if (reason) return bad(reason);
  }
  return { ok: true };
}

function toPack(raw, path, builtin) {
  const catRef = typeof raw.category === "string" ? raw.category : raw.category.id;
  return {
    ...raw,
    path,
    builtin,
    categoryId: catRef,
    categoryDef: typeof raw.category === "object" ? raw.category : null,
    category: typeof raw.category === "object" ? raw.category : { id: catRef, label: catRef },
    tags: list(raw.tags).length ? list(raw.tags) : list(typeof raw.category === "object" ? raw.category.tags : []),
    scope: Array.isArray(raw.scope) ? raw.scope : DEFAULT_SCOPE,
    presets: Array.isArray(raw.presets) ? raw.presets : null,
    options: raw.options && typeof raw.options === "object" ? raw.options : {},
    patterns: list(raw.patterns).map(compilePattern),
    detect: typeof raw.detect === "function" ? raw.detect : null,
  };
}

function filesIn(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesIn(path));
    else if (/\.(json|mjs)$/.test(entry.name) && path !== PRESETS_FILE) out.push(path);
  }
  return out;
}

function sourceFiles(entry, cwd) {
  const path = isAbsolute(entry) ? entry : resolve(cwd, entry);
  if (!existsSync(path)) return [];
  if (statSync(path).isDirectory()) return filesIn(path);
  return /\.(json|mjs)$/.test(path) ? [path] : [];
}

async function readPack(path) {
  if (path.endsWith(".mjs")) return (await import(pathToFileURL(path).href)).default;
  return JSON.parse(readFileSync(path, "utf8"));
}

async function addSource(files, builtin, byId, problems) {
  const seen = new Set();
  for (const path of files) {
    let raw = null;
    try {
      raw = await readPack(path);
    } catch (err) {
      problems.push({ path, reason: err.message });
      continue;
    }
    const check = validatePack(raw, path);
    if (!check.ok) {
      problems.push({ path, reason: check.reason });
      continue;
    }
    if (seen.has(raw.id)) {
      problems.push({ path, reason: `duplicate id ${raw.id} in this source` });
      continue;
    }
    seen.add(raw.id);
    byId.set(raw.id, toPack(raw, path, builtin));
  }
}

function readPresets() {
  try {
    return JSON.parse(readFileSync(PRESETS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function categoriesOf(packs) {
  const byId = new Map();
  for (const pack of packs) {
    if (pack.feature !== "aiWriting" || !pack.categoryDef || byId.has(pack.categoryId)) continue;
    byId.set(pack.categoryId, pack.categoryDef);
  }
  for (const pack of packs) {
    if (pack.feature === "aiWriting" && byId.has(pack.categoryId)) pack.category = byId.get(pack.categoryId);
  }
  return [...byId.values()];
}

/** The user pack directory. `$XDG_CONFIG_HOME/concise/patterns`, else `~/.config/concise/patterns`. */
export function userPatternsDir(env = process.env) {
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "concise", "patterns");
  const home = env.HOME || env.USERPROFILE;
  return home ? join(home, ".config", "concise", "patterns") : null;
}

/** User packs load only when `env` is given, so the scripts and tests that pass no env see the built-ins alone. */
export async function loadPacks({ cwd, config, env } = {}) {
  const base = cwd || ".";
  const ai = aiConfig(config);
  const byId = new Map();
  const problems = [];
  await addSource(filesIn(BUILTIN_DIR), true, byId, problems);
  const user = env ? userPatternsDir(env) : null;
  if (user) await addSource(filesIn(user), false, byId, problems);
  await addSource(filesIn(join(base, ".claude", "concise", "patterns")), false, byId, problems);
  await addSource(filesIn(join(base, ".codex", "concise", "patterns")), false, byId, problems);
  for (const entry of ai.packs) await addSource(sourceFiles(String(entry), base), false, byId, problems);
  const packs = [...byId.values()];
  return { packs, categories: categoriesOf(packs), presets: readPresets(), problems };
}

export const inScope = (pack, scope) => !scope || pack.scope.includes(scope);

const namesOf = (pack) => [pack.id, pack.categoryId, ...pack.tags.map((t) => `tag:${t}`)];

export function resolveActive({ packs = [], presets = {}, config = {} } = {}) {
  const ai = aiConfig(config);
  const preset = presets[ai.preset] ? ai.preset : "default";
  const disable = new Set(ai.disablePatterns);
  const exclude = new Set(ai.excludePacks);
  const mine = packs.filter((p) => p.feature === "aiWriting");
  const enabled = mine.filter((p) => !exclude.has(p.id) && !namesOf(p).some((n) => disable.has(n)));
  const known = new Set(mine.map((p) => p.categoryId));

  let cats = new Set();
  if (Array.isArray(ai.categories)) cats = new Set(ai.categories.filter((id) => known.has(id)));
  else for (const p of enabled) if (preset === "all" || (p.presets ? p.presets.includes(preset) : !p.builtin)) cats.add(p.categoryId);

  for (const p of mine) if (namesOf(p).some((n) => ai.enablePatterns.includes(n))) cats.add(p.categoryId);
  for (const id of ai.enablePatterns) if (known.has(id)) cats.add(id);
  for (const p of mine) if (namesOf(p).some((n) => disable.has(n))) cats.delete(p.categoryId);
  for (const id of ai.disablePatterns) cats.delete(id);

  const active = enabled
    .filter((p) => cats.has(p.categoryId))
    .map((p) => ({ ...p, options: { ...p.options, ...(ai.options[p.id] || {}) } }));
  return { packs: active, categoryIds: cats, allow: [...list((presets[preset] || {}).allow), ...ai.allow] };
}
