import { createHash } from "node:crypto";
import { bumpAttempt, resetAttempt, setPending, takePending, clearPending } from "./state.mjs";
import { flagged, deny, ask } from "./respond.mjs";

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const STOP_HINT = "\n\nRewrite the reply, or send the same reply again to confirm intent.";
const keepHint = (reference) =>
  `\n\nTo keep it, send the identical write again to confirm. To fix it, read ${reference}.`;

const STOP_BLOCK_MESSAGE = "[concise] reply held for style review";

function held(event, text) {
  if (event !== "Stop") return deny(text);
  return { decision: "block", reason: text, systemMessage: STOP_BLOCK_MESSAGE };
}

function noted(event, text) {
  return event === "Stop" ? { systemMessage: text } : flagged(text);
}

function overRetries(sessionId, key, event, message, maxRetries) {
  resetAttempt(sessionId, key);
  clearPending(sessionId, key);
  return noted(event, `${message}\n\n(Allowed through after ${maxRetries} nudges, flagging for manual review.)`);
}

export function resolveStyle({ sessionId, key, hash, mode, maxRetries, message, event, summary, reference }) {
  if (mode === "ask" && event !== "Stop") return ask(message);

  if (mode === "deny") {
    if (bumpAttempt(sessionId, key) > maxRetries) return overRetries(sessionId, key, event, message, maxRetries);
    return held(event, message);
  }

  if (takePending(sessionId, key) === hash) {
    resetAttempt(sessionId, key);
    return noted(event, `[concise] Kept after confirmation: ${summary}`);
  }

  if (bumpAttempt(sessionId, key) > maxRetries) return overRetries(sessionId, key, event, message, maxRetries);

  setPending(sessionId, key, hash);
  return held(event, message + (event === "Stop" ? STOP_HINT : keepHint(reference)));
}

/** A clean pass ends the episode: no counter, no hash to confirm. */
export function clearStyle(sessionId, key) {
  resetAttempt(sessionId, key);
  clearPending(sessionId, key);
}
