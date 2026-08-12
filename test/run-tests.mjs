#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK_EDIT = join(ROOT, "hooks", "check-edit.mjs");
const CHECK_BASH = join(ROOT, "hooks", "check-bash.mjs");

let pass = 0;
let fail = 0;

function run(script, inputObj) {
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

function assertDenied(name, result) {
  if (isDeny(result)) {
    console.log(`  ok - ${name}`);
    pass++;
  } else {
    console.log(`  FAIL - ${name}: expected deny, got ${JSON.stringify(result)}`);
    fail++;
  }
}

function assertAllowed(name, result) {
  if (!isDeny(result)) {
    console.log(`  ok - ${name}`);
    pass++;
  } else {
    console.log(`  FAIL - ${name}: expected allow, got deny: ${JSON.stringify(result)}`);
    fail++;
  }
}

const workDir = mkdtempSync(join(tmpdir(), "concise-test-"));
const sessionId = `test-${Date.now()}`;

function writeFixture(name, content) {
  const p = join(workDir, name);
  writeFileSync(p, content);
  return p;
}

function editEvent(filePath, sid) {
  return { tool_name: "Write", tool_input: { file_path: filePath, content: "" }, cwd: workDir, session_id: sid };
}

console.log("check-edit.mjs");

{
  const p = writeFixture("short.ts", "// one line\nexport const x = 1;\n");
  assertAllowed("short comment allowed", run(CHECK_EDIT, editEvent(p, sessionId + "-1")));
}

{
  const p = writeFixture("long-comment.ts", "// line 1\n// line 2\n// line 3\n// line 4\n// line 5\nexport const x = 1;\n");
  assertDenied("5-line comment denied", run(CHECK_EDIT, editEvent(p, sessionId + "-2")));
}

{
  const p = writeFixture(
    "ignored-comment.ts",
    "// line 1 concise-ignore\n// line 2\n// line 3\n// line 4\n// line 5\nexport const x = 1;\n",
  );
  assertAllowed("concise-ignore comment allowed", run(CHECK_EDIT, editEvent(p, sessionId + "-3")));
}

{
  const bigContent = Array.from({ length: 320 }, (_, i) => `const line${i} = ${i};`).join("\n") + "\n";
  const p = writeFixture("big.ts", bigContent);
  assertDenied("320-line file denied", run(CHECK_EDIT, editEvent(p, sessionId + "-4")));
}

{
  const nmDir = join(workDir, "node_modules", "pkg");
  mkdirSync(nmDir, { recursive: true });
  const p = join(nmDir, "index.js");
  writeFileSync(p, "// 1\n// 2\n// 3\n// 4\n");
  assertAllowed("node_modules path ignored", run(CHECK_EDIT, editEvent(p, sessionId + "-5")));
}

{
  const p = writeFixture("retry.ts", "// line 1\n// line 2\n// line 3\n// line 4\n// line 5\nexport const x = 1;\n");
  const sid = sessionId + "-retry";
  const r1 = run(CHECK_EDIT, editEvent(p, sid));
  const r2 = run(CHECK_EDIT, editEvent(p, sid));
  const r3 = run(CHECK_EDIT, editEvent(p, sid));
  assertDenied("retry attempt 1 denied", r1);
  assertDenied("retry attempt 2 denied", r2);
  assertAllowed("retry attempt 3 allowed-with-flag", r3);
  if (r3.systemMessage?.includes("Allowed through")) {
    console.log("  ok - attempt 3 systemMessage explains why");
    pass++;
  } else {
    console.log(`  FAIL - attempt 3 missing explanation: ${JSON.stringify(r3)}`);
    fail++;
  }
}

{
  const p = writeFixture("block-comment.ts", "/*\n * line 2\n * line 3\n * line 4\n */\nexport const x = 1;\n");
  assertDenied("5-line block comment denied", run(CHECK_EDIT, editEvent(p, sessionId + "-6")));
}

console.log("\ncheck-bash.mjs");

function bashEvent(command, sid) {
  return { tool_name: "Bash", tool_input: { command }, cwd: workDir, session_id: sid };
}

{
  const command =
    "gh pr create --title \"x\" --body \"$(cat <<'EOF'\nThis is a long paragraph of prose about the change with several sentences in a row explaining everything at length.\n\nAnd here is a second unrelated paragraph continuing to explain more things in prose form as well.\nEOF\n)\"";
  assertDenied("2-paragraph PR body denied", run(CHECK_BASH, bashEvent(command, sessionId + "-pr1")));
}

{
  const command =
    "gh pr create --title \"x\" --body \"$(cat <<'EOF'\n## Summary\n- Adds the thing\n- Fixes the bug\n\n## Test plan\n- [ ] Run tests\n- [ ] Verify manually\nEOF\n)\"";
  assertAllowed("structured PR body allowed", run(CHECK_BASH, bashEvent(command, sessionId + "-pr2")));
}

{
  assertAllowed("unrelated bash command allowed", run(CHECK_BASH, bashEvent("ls -la", sessionId + "-ls")));
}

{
  const command =
    "gh pr create --title \"x\" --body \"$(cat <<'EOF'\nThis is a long paragraph of prose. concise-ignore\n\nAnother paragraph here too, with more prose going on and on.\nEOF\n)\"";
  assertAllowed("concise-ignore in PR body allowed", run(CHECK_BASH, bashEvent(command, sessionId + "-pr3")));
}

{
  const command = 'gh pr create --title "x" --body "One short sentence. Two short sentence."';
  assertAllowed("single-paragraph quoted PR body allowed", run(CHECK_BASH, bashEvent(command, sessionId + "-pr4")));
}

rmSync(workDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
