import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { rotateBySize } from "./log.mjs";

const REFRESH_MS = 60_000;
const MAX_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;
const RECORD_LIMIT = 2 * 1024 * 1024;
const NAME_LENGTH = 40;
const KEY = /^[0-9a-f]{64}$/;

const home = (env) => env.HOME || env.USERPROFILE || null;

/** The realpath of cwd and its sha256, shared by the monitor registry and the project registry. */
export function projectKey(cwd) {
  let path = resolve(cwd || process.cwd());
  try {
    path = realpathSync(path);
  } catch {}
  return { cwd: path, key: createHash("sha256").update(path).digest("hex") };
}

/** null when there is no home directory: a hub has no user root to read from. */
export function projectsDir(env = process.env) {
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "concise", "projects");
  const base = home(env);
  return base ? join(base, ".config", "concise", "projects") : null;
}

export function stateDir(env = process.env) {
  if (env.XDG_STATE_HOME) return join(env.XDG_STATE_HOME, "concise");
  const base = home(env);
  return base ? join(base, ".local", "state", "concise") : null;
}

export function projectName(cwd) {
  const name = basename(cwd).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, NAME_LENGTH);
  return name || "project";
}

export function projectFile(cwd, env = process.env) {
  const dir = projectsDir(env);
  if (!dir) return null;
  const { cwd: path, key } = projectKey(cwd);
  return join(dir, `${projectName(path)}-${key.slice(0, 12)}.json`);
}

export function recordsPath(cwd, env = process.env) {
  const dir = stateDir(env);
  return dir ? join(dir, "projects", projectKey(cwd).key, "records.jsonl") : null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

/** Upserts the registry entry for cwd. Skips the write while the entry is under a minute old. */
export function registerProject(cwd, env = process.env, now = Date.now()) {
  const file = projectFile(cwd, env);
  if (!file) return null;
  const { cwd: path, key } = projectKey(cwd);
  const records = recordsPath(path, env);
  const current = readJson(file);
  const fresh = current && current.cwd === path && current.records === records && now - Date.parse(current.lastSeen) < REFRESH_MS;
  if (fresh) return current;
  const ts = new Date(now).toISOString();
  const entry = { cwd: path, name: projectName(path), key, firstSeen: current?.firstSeen || ts, lastSeen: ts, records };
  writeAtomic(file, entry);
  return entry;
}

export function appendProjectRecord(record, env = process.env) {
  const path = recordsPath(record.cwd, env);
  if (!path) return false;
  const line = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(line) > RECORD_LIMIT) return false;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  rotateBySize(path, MAX_SIZE, MAX_FILES);
  appendFileSync(path, line, { mode: 0o600 });
  return true;
}

/** Every valid registry entry, newest activity first. */
export function listProjects(env = process.env) {
  const dir = projectsDir(env);
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const entry = readJson(join(dir, name));
    const valid = entry && typeof entry.cwd === "string" && KEY.test(entry.key) && typeof entry.records === "string";
    if (valid) out.push({ ...entry, file: join(dir, name) });
  }
  return out.sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
}
