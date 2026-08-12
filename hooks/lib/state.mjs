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
    // Best effort — if we can't persist, every future call just looks like a fresh attempt.
  }
}

/** Returns the attempt count after this call (1-indexed). One counter per (session, key). */
export function bumpAttempt(sessionId, key) {
  const state = readState(sessionId);
  state[key] = (state[key] || 0) + 1;
  writeState(sessionId, state);
  return state[key];
}
