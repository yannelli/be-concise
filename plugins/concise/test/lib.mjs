import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const ROOT = new URL("..", import.meta.url).pathname;
export const CHECK_EDIT = join(ROOT, "hooks", "check-edit.mjs");
export const CHECK_BASH = join(ROOT, "hooks", "check-bash.mjs");

let pass = 0;
let fail = 0;

export function ok(name) {
  console.log(`  ok - ${name}`);
  pass++;
}

export function bad(name, detail) {
  console.log(`  FAIL - ${name}: ${detail}`);
  fail++;
}

export function run(script, inputObj) {
  const res = spawnSync("node", [script], { input: JSON.stringify(inputObj), encoding: "utf8" });
  if (res.status !== 0) throw new Error(`${script} exited ${res.status}: ${res.stderr}`);
  try {
    return JSON.parse(res.stdout || "{}");
  } catch {
    throw new Error(`${script} produced non-JSON stdout: ${res.stdout}`);
  }
}

function isDeny(result) {
  return result?.hookSpecificOutput?.permissionDecision === "deny";
}

// The reason is the only field the agent reads back, so a deny without one is a silent block.
export function assertDenied(name, result) {
  if (!isDeny(result)) return bad(name, `expected deny, got ${JSON.stringify(result)}`);
  const reason = result.hookSpecificOutput.permissionDecisionReason;
  if (!reason || !reason.includes("[concise]")) return bad(name, `deny is missing a reason: ${JSON.stringify(result)}`);
  if (result.hookSpecificOutput.hookEventName !== "PreToolUse") return bad(name, "deny is not a PreToolUse payload");
  ok(name);
}

export function assertAllowed(name, result) {
  if (isDeny(result)) return bad(name, `expected allow, got deny: ${JSON.stringify(result)}`);
  ok(name);
}

// Codex ignores systemMessage on PreToolUse, so the flag must also ride in additionalContext.
export function assertFlagged(name, result) {
  const sys = result.systemMessage || "";
  const ctx = result.hookSpecificOutput?.additionalContext || "";
  if (sys.includes("Allowed through") && ctx.includes("Allowed through")) return ok(name);
  bad(name, `expected an allowed-with-flag systemMessage + additionalContext, got ${JSON.stringify(result)}`);
}

export function summary() {
  console.log(`\n${pass} passed, ${fail} failed`);
  return fail > 0 ? 1 : 0;
}
