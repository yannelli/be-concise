#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:os";
import { fileURLToPath } from "node:url";
import { readStdin } from "./lib/hook-main.mjs";
import { publishMonitor } from "./lib/monitor.mjs";

const started = Date.now();
const raw = await readStdin();
const script = fileURLToPath(new URL("./PreToolUse-test-filter.sh", import.meta.url));
const stdout = [];
const stderr = [];
let error = null;
const status = await new Promise((resolve) => {
  const child = spawn("bash", [script]);
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.on("error", () => {});
  child.on("error", (err) => { error = err.message; });
  child.on("close", (code, signal) => resolve(code ?? (signal ? 128 + (constants.signals[signal] || 0) : 1)));
  child.stdin.end(raw);
});
const output = Buffer.concat(stdout);
const errors = Buffer.concat(stderr);
let input = {};
let response = {};
try {
  input = JSON.parse(raw || "{}");
  response = JSON.parse(output.toString("utf8") || "{}");
} catch (err) {
  error ||= err.message;
}
await publishMonitor({
  ts: new Date().toISOString(),
  hook: "test-filter",
  event: input?.hook_event_name || "PreToolUse",
  tool: input?.tool_name ?? null,
  session: input?.session_id ?? null,
  cwd: input?.cwd || process.cwd(),
  decision: status || error ? "error" : response?.hookSpecificOutput?.updatedInput?.command ? "rewrite" : "allow",
  durationMs: Date.now() - started,
  findings: [],
  counts: { emDash: 0, aiWriting: 0 },
  error: error || (status ? errors.toString("utf8").trim() || `Bash exited ${status}` : null),
  request: input,
  response,
  source: "live",
});
process.stdout.write(output);
process.stderr.write(errors);
process.exitCode = status;
