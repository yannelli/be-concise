import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, renameSync, opendirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const scope = new AsyncLocalStorage();
const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
const root = join(tmpdir(), `concise-state-${process.getuid?.() ?? "user"}`);
const sessionPath = (sessionId) => join(root, digest(sessionId || "default"));

export function withStateScope(input, callback) {
  const agent = input.agent_id ? `agent:${input.agent_id}` : input.agent_transcript_path ? `transcript:${input.agent_transcript_path}` : "main";
  return scope.run({ agent }, callback);
}

export function statePath(sessionId, agentId) {
  const agent = agentId === undefined ? scope.getStore()?.agent || "main" : `agent:${agentId}`;
  return join(sessionPath(sessionId), `${digest(agent)}.json`);
}

function readState(sessionId) {
  const p = statePath(sessionId);
  try {
    const state = JSON.parse(readFileSync(p, "utf8"));
    return state && typeof state === "object" && !Array.isArray(state) ? state : {};
  } catch {
    return {};
  }
}

function writeState(sessionId, state) {
  const path = statePath(sessionId);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    renameSync(temporary, path);
  } catch {
    try { unlinkSync(temporary); } catch {}
  }
}

export function cleanupSession(sessionId, timeoutMs = 550) {
  if (typeof sessionId !== "string" || !sessionId) return false;
  const deadline = Date.now() + timeoutMs;
  const path = sessionPath(sessionId);
  let directory;
  try {
    directory = opendirSync(path);
    let entry;
    while (Date.now() < deadline && (entry = directory.readSync())) {
      if (/^[0-9a-f]{64}\.json(?:\.\d+\.tmp)?$/.test(entry.name)) unlinkSync(join(path, entry.name));
    }
    directory.closeSync();
    directory = null;
    rmdirSync(path);
    return true;
  } catch (error) {
    return error.code === "ENOENT";
  } finally {
    try { directory?.closeSync(); } catch {}
  }
}

export function bumpAttempt(sessionId, key) {
  const state = readState(sessionId);
  state[key] = (state[key] || 0) + 1;
  writeState(sessionId, state);
  return state[key];
}

/** Clears a counter so a later violation on the same key starts nudging from scratch. */
export function resetAttempt(sessionId, key) {
    const state = readState(sessionId);
    if (!(key in state)) return;
    delete state[key];
    writeState(sessionId, state);
}

/** True the first time this (session, key) pair is seen, false after that. */
export function once(sessionId, key) {
  const state = readState(sessionId);
  if (state[key]) return false;
  state[key] = 1;
  writeState(sessionId, state);
  return true;
}

const pendingKey = (key) => `pending:${key}`;

/** Records the hash the agent has to send again to confirm the text it just wrote. */
export function setPending(sessionId, key, hash) {
  const state = readState(sessionId);
  state[pendingKey(key)] = hash;
  writeState(sessionId, state);
}

/** Returns the recorded hash and deletes it, so one deny buys one confirmation. */
export function takePending(sessionId, key) {
  const state = readState(sessionId);
  const stored = state[pendingKey(key)];
  if (stored === undefined) return null;
  delete state[pendingKey(key)];
  writeState(sessionId, state);
  return stored;
}

export function clearPending(sessionId, key) {
  const state = readState(sessionId);
  if (!(pendingKey(key) in state)) return;
  delete state[pendingKey(key)];
  writeState(sessionId, state);
}
