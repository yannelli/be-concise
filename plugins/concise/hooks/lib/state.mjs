import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function statePath(sessionId) {
  return join(tmpdir(), `concise-state-${sessionId || "default"}.json`);
}

function readState(sessionId) {
  const p = statePath(sessionId);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function writeState(sessionId, state) {
  try {
    writeFileSync(statePath(sessionId), JSON.stringify(state));
  } catch {
        // Best effort: if we can't persist, every future call just looks like a fresh attempt.
  }
}

/** Returns the attempt count after this call (1-indexed). One counter per (session, key). */
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
