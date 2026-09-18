import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, bad, ok } from "./lib.mjs";

const FILTER = join(ROOT, "hooks/PreToolUse-test-filter.sh");
const root = mkdtempSync(join(tmpdir(), "concise-filter-log-"));
const env = { ...process.env, HOME: root, TMPDIR: root, NOFILTER: "" };
const logBase = join(root, `concise-test-filter-${process.getuid()}`);

function check(name, condition, detail) {
  if (condition) ok(name);
  else bad(name, JSON.stringify(detail));
}

function rewrite(command, session_id) {
  const input = { tool_name: "Bash", tool_input: { command }, session_id, cwd: root };
  const result = spawnSync("bash", [FILTER], { input: JSON.stringify(input), encoding: "utf8", env });
  if (result.status !== 0) throw new Error(`filter exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout).hookSpecificOutput?.updatedInput?.command ?? null;
}

function execute(command) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", command], { env });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("close", (code) => resolve({ code, stdout }));
  });
}

const logPath = (stdout) => stdout.match(/full log: cat (\S+)/)?.[1];

console.log("\nTest filter log isolation");

{
  // A outlives B, so a shared log would hand A the output B truncated it with.
  const slow = rewrite("jest() { echo 'FAIL alpha-1'; sleep 1.5; echo 'FAIL alpha-2'; return 3; }; jest", "session-alpha");
  const fast = rewrite("jest() { sleep 0.3; echo 'FAIL beta-1'; echo 'FAIL beta-2'; }; jest", "session-beta");
  const [a, b] = await Promise.all([execute(slow), execute(fast)]);
  check("session A sees only its own output", a.stdout.includes("alpha-2") && !a.stdout.includes("beta"), a);
  check("session B sees only its own output", b.stdout.includes("beta-2") && !b.stdout.includes("alpha"), b);
  check("each run keeps its own exit status", a.code === 3 && b.code === 0, { a: a.code, b: b.code });
  const [logA, logB] = [logPath(a.stdout), logPath(b.stdout)];
  check("the two sessions get distinct log files", logA && logB && logA !== logB, { logA, logB });
  check("each log lives under its session directory", logA?.startsWith(join(logBase, "session-alpha") + "/") && logB?.startsWith(join(logBase, "session-beta") + "/"), { logA, logB });
  check("each log holds only its own run", !readFileSync(logA, "utf8").includes("beta") && !readFileSync(logB, "utf8").includes("alpha"), { logA, logB });
}

{
  const [first, second] = await Promise.all([1, 2].map((n) => execute(rewrite(`jest() { echo 'FAIL same-${n}'; }; jest`, "session-same"))));
  check("parallel runs in one session do not share a log", logPath(first.stdout) !== logPath(second.stdout) && !first.stdout.includes("same-2") && !second.stdout.includes("same-1"), { first, second });
}

{
  const out = await execute(rewrite("jest() { echo 'FAIL escape'; }; jest", "../../escape"));
  check("an unsafe session id cannot leave the log directory", logPath(out.stdout)?.startsWith(join(logBase, "nosession") + "/"), out);
}

{
  const quiet = await execute(rewrite("jest() { return 4; }; jest", "session-quiet"));
  check("a run with no output prints nothing and keeps its status", quiet.stdout === "" && quiet.code === 4, quiet);
  check("an empty run leaves no log behind", readdirSync(join(logBase, "session-quiet")).length === 0);
}

{
  for (const command of ["npm test > out.log 2>&1", "npm test >out.log", "go test ./... >> run.txt", "npm test &> out.log", "cd app && npm test 1>out.log"]) {
    check(`stdout redirect skips filtering: ${command}`, rewrite(command, "session-redirect") === null);
  }
  for (const command of ["npm test 2>&1 | tail -n 20", "npm test 2>/dev/null", "npm test >&2", "npm test -- --grep 'a > b'"]) {
    check(`output still reaching the agent is filtered: ${command}`, rewrite(command, "session-redirect") !== null);
  }
}

{
  for (const command of ["NOFILTER=1 npm test", "cd app && NOFILTER=1 npm test", "export NOFILTER=1; go test ./...", "FILTER_LINES=5 NOFILTER=1 npm test", "(NOFILTER='1' npm test)"]) {
    check(`NOFILTER anywhere bypasses: ${command}`, rewrite(command, "session-bypass") === null);
  }
  for (const command of ["cd app && npm test", "NOFILTER=0 npm test", "MYNOFILTER=1 npm test"]) {
    check(`no bypass without NOFILTER=1: ${command}`, rewrite(command, "session-bypass") !== null);
  }
}

rmSync(root, { recursive: true, force: true });
