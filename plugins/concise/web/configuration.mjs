import { existsSync, readFileSync, realpathSync, statSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { defaultConfig, loadConfig, projectConfigPath, userConfigPath } from "../hooks/lib/config.mjs";
import { readEnv, parseSize } from "../hooks/lib/env.mjs";

export const problem = (message, status = 400) => Object.assign(new Error(message), { status });
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const revision = (text) => createHash("sha256").update(text).digest("hex");

export function validateConfig(config, base = defaultConfig(), prefix = "") {
  if (!object(config)) throw problem(`${prefix || "Configuration"} must be a JSON object`);
  for (const [key, value] of Object.entries(config)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (["__proto__", "constructor", "prototype", "problems"].includes(key)) throw problem(`Unsupported key: ${path}`);
    if (!(key in base)) throw problem(`Unknown configuration key: ${path}`);
    const expected = base[key];
    if (path === "features.aiWriting.options") {
      if (!object(value) || Object.values(value).some((item) => !object(item))) throw problem(`${path} must map pack ids to objects`);
    } else if (path === "features.aiWriting.categories") {
      if (value !== null && (!Array.isArray(value) || value.some((item) => typeof item !== "string"))) throw problem(`${path} must be null or a string array`);
    } else if (path === "log.path") {
      if (value !== null && typeof value !== "string") throw problem(`${path} must be null or a path`);
    } else if (path === "log.maxSize") {
      if (!parseSize(value)) throw problem(`${path} must be a positive size such as 5m`);
    } else if (Array.isArray(expected)) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw problem(`${path} must be a string array`);
    } else if (object(expected)) validateConfig(value, expected, path);
    else if (typeof value !== typeof expected) throw problem(`${path} must be ${typeof expected}`);
    else if (typeof expected === "number" && (!Number.isSafeInteger(value) || value < (key === "maxRetries" ? 0 : 1))) {
      throw problem(`${path} must be an integer of at least ${key === "maxRetries" ? 0 : 1}`);
    }
    if (path.endsWith(".mode") && !["confirm", "ask", "deny"].includes(value)) throw problem(`${path} must be confirm, ask, or deny`);
    if (path === "log.rotate" && !["none", "size", "daily", "both"].includes(value)) throw problem(`${path} must be none, size, daily, or both`);
    if (path === "log.format" && !["json", "plaintext"].includes(value)) throw problem(`${path} must be json or plaintext`);
    if (["allowList.patterns", "bypass.patterns"].includes(path)) {
      for (const source of value) try { new RegExp(source, "i"); } catch { throw problem(`Invalid regex in ${path}: ${source}`); }
    }
  }
  return config;
}

function layer(id, label, path, active = false) {
  const exists = existsSync(path);
  let text = "";
  let error;
  try { if (exists) text = readFileSync(path, "utf8"); } catch (err) { error = err.message; }
  return { id, label, path, exists, text, revision: exists ? revision(text) : null, active, ...(error ? { error } : {}) };
}

export function configuration(cwd, env) {
  const home = env.HOME || env.USERPROFILE;
  const user = userConfigPath(env);
  const project = projectConfigPath(cwd, readEnv(env));
  const candidates = [
    ...(env.XDG_CONFIG_HOME ? [["user-xdg", "User (XDG)", join(env.XDG_CONFIG_HOME, "concise", "concise.json")]] : []),
    ...(home ? [
      ["user", "User", join(home, ".config", "concise", "concise.json")],
      ["user-claude", "User (Claude)", join(home, ".claude", "concise.json")],
      ["user-codex", "User (Codex)", join(home, ".codex", "concise.json")],
    ] : []),
    ...(readEnv(env).configPath ? [["project-override", "Project (BEC_CONFIG_PATH)", resolve(cwd, readEnv(env).configPath)]] : []),
    ["project-claude", "Project (Claude)", join(cwd, ".claude", "concise.json")],
    ["project-codex", "Project (Codex)", join(cwd, ".codex", "concise.json")],
  ];
  const seen = new Set();
  const layers = candidates.filter(([, , path]) => !seen.has(path) && seen.add(path)).map(([id, label, path]) =>
    layer(id, label, path, path === user || path === (project ? resolve(cwd, project) : null)));
  const filterLayers = home ? ["claude", "codex"].map((host) =>
    layer(`filter-${host}`, `Test filter (${host})`, join(home, `.${host}`, "test-filter.conf"), true)) : [];
  return { defaults: defaultConfig(), effective: loadConfig(cwd, env), layers, filterLayers,
    environment: Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith("BEC_") && !/TOKEN/.test(key))) };
}

export function saveConfiguration(cwd, env, { id, text, revision: previous }) {
  const state = configuration(cwd, env);
  const target = [...state.layers, ...state.filterLayers].find((item) => item.id === id);
  if (!target) throw problem("Unknown configuration layer");
  if (target.error) throw problem(target.error);
  if (target.revision !== previous) throw problem("Configuration changed on disk. Reload before saving.", 409);
  if (typeof text !== "string") throw problem("text must be a string");
  if (id.startsWith("filter-")) validateFilter(text);
  else {
    let parsed;
    try { parsed = JSON.parse(text); } catch (err) { throw problem(`Invalid JSON: ${err.message}`); }
    validateConfig(parsed);
  }
  const path = target.exists ? realpathSync(target.path) : target.path;
  const mode = target.exists ? statSync(path).mode & 0o777 : 0o600;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, text.endsWith("\n") ? text : `${text}\n`, { flag: "wx", mode });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

export function validateFilter(text) {
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = /^\s*(FILTER_LINES|FILTER_CONTEXT|FILTER_TAIL|FILTER_PATTERN|NOFILTER)=(.*)\s*$/.exec(line);
    if (!match) throw problem("Test filter config accepts one FILTER_* or NOFILTER assignment per line");
    const [, key, raw] = match;
    if (key === "FILTER_PATTERN") {
      if (!/^'[^'\n]*'$/.test(raw.trim())) throw problem("FILTER_PATTERN must use single quotes");
    } else if (!/^\d+$/.test(raw.trim()) || (key === "NOFILTER" && !["0", "1"].includes(raw.trim()))) {
      throw problem(`${key} must be ${key === "NOFILTER" ? "0 or 1" : "a non-negative integer"}`);
    }
  }
}
