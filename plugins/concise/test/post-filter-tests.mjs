import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT, bad, ok, run } from "./lib.mjs";
import { assertEmpty, bashEvent, cleanup, setup } from "./features-lib.mjs";

const POST = join(ROOT, "hooks/post-test-filter.mjs");
const PRE = join(ROOT, "hooks/monitor-filter.mjs");
const enabled = { testFilter: { codexPostToolUse: true } };
const logs = new Set();
const c = setup(enabled);
const filterHome = setup({}).dir;
const env = { HOME: filterHome, USERPROFILE: "", XDG_CONFIG_HOME: "", CONCISE_HOOK_HOST: "", BEC_MONITOR_DISABLED: "1" };
const event = (command = "npm test", response = { output: "PASS example.test.js\n1 passed\n", exit_code: 0 }) => ({
  ...bashEvent(c, command), hook_event_name: "PostToolUse", turn_id: "post-filter-turn", tool_response: response,
});

function check(name, condition, detail) {
  if (condition) ok(name);
  else bad(name, JSON.stringify(detail));
}

function post(input, overrides) {
  const result = run(POST, input, { ...env, ...overrides });
  for (const match of result.stopReason?.matchAll(/cat '([^']+)'/g) || []) logs.add(dirname(match[1]));
  return result;
}

console.log("\nPostToolUse filter contracts (fixtures)");

{
  const defaults = setup({});
  assertEmpty("Codex post filtering is disabled by default", post({ ...event(), cwd: defaults.dir }));
  const preEvent = { ...event(), hook_event_name: "PreToolUse" };
  const original = run(PRE, { ...preEvent, cwd: defaults.dir }, env);
  check("Codex retains the default pre rewrite", original.hookSpecificOutput?.updatedInput?.command.includes("TF_CMD="), original);
  assertEmpty("opted-in Codex skips pre rewriting", run(PRE, preEvent, env));
  const claude = { ...preEvent, turn_id: undefined };
  const rewrite = run(PRE, claude, env);
  check("Claude retains pre rewriting when Codex post filtering is enabled", rewrite.hookSpecificOutput?.updatedInput?.command.includes("TF_CMD="), rewrite);
  assertEmpty("Claude post output is unchanged", post({ ...event(), turn_id: undefined }));
  check("explicit Codex wiring enables post filtering", post({ ...event(), turn_id: undefined }, { CONCISE_HOOK_HOST: "codex" }).continue === false);
}

{
  const output = "noise\nNOTE first\ncontext line\nNOTE second\nlast\n";
  const input = event("FILTER_PATTERN='^NOTE' FILTER_LINES=2 FILTER_CONTEXT=1 FILTER_TAIL=1 npm test", { output, exit_code: 0 });
  const result = post(input);
  check("replacement uses continue false without a block decision", result.continue === false && result.decision === undefined && typeof result.stopReason === "string", result);
  check("successful output applies the pattern, context, cap, and tail", result.stopReason?.includes("NOTE first\ncontext line") && result.stopReason.includes("last") && !result.stopReason.includes("NOTE second") && !result.stopReason.includes("noise"), result);
  const paths = [...(result.stopReason?.matchAll(/cat '([^']+)'/g) || [])].map((match) => match[1]);
  check("raw available output is saved before replacement", paths[0] && readFileSync(paths[0], "utf8") === output, paths);
  check("the original response and metadata are saved", paths[1] && readFileSync(paths[1], "utf8") === JSON.stringify(input.tool_response), paths);
}

{
  const output = "FAIL first\n" + Array.from({ length: 120 }, (_, i) => `diagnostic ${i}`).join("\n") + "\nFAIL final\n";
  const failed = post(event("FILTER_LINES=1 FILTER_CONTEXT=0 FILTER_TAIL=0 npm test", { stdout: output, stderr: "stderr diagnostic", exitCode: 7 }));
  check("failure output and stderr survive line caps", failed.stopReason?.includes(output) && failed.stopReason.includes("stderr diagnostic") && failed.stopReason.includes("exit=7"), failed);
  const hiddenExit = post(event("FILTER_PATTERN='^PASS' FILTER_LINES=1 FILTER_TAIL=0 npm test", { output, exit_code: 0 }));
  check("reported failures survive success status and custom patterns", hiddenExit.stopReason?.includes(output), hiddenExit);
  const colored = "\u001b[31mFAIL\u001b[0m example\nfull diagnostic\n";
  check("colored failure evidence survives success caps", post(event("FILTER_LINES=0 FILTER_TAIL=0 npm test", { output: colored, exit_code: 0 })).stopReason?.includes(colored));
}

{
  for (const command of ["NOFILTER=1 npm test", "ls -la", "FILTER_LINES=invalid npm test"]) {
    assertEmpty(`post filter bypasses ${command}`, post(event(command)));
  }
  writeFileSync(join(filterHome, ".claude/test-filter.conf"), "NOFILTER=1\n");
  assertEmpty("post filter reads existing user filter bypass settings", post(event()));
  writeFileSync(join(filterHome, ".claude/test-filter.conf"), "FILTER_TAIL=1\nFILTER_LINES=2\n");
  const configured = post(event("npm test", { output: "first\nsecond\nthird\n", exit_code: 0 }));
  check("post filter reads user filter caps", configured.stopReason?.includes("cap 2") && configured.stopReason.includes("last 1 lines:") && !configured.stopReason.includes("second"), configured);
  rmSync(join(filterHome, ".claude/test-filter.conf"));
  assertEmpty("configured bypass phrases apply", post(event("npm test # full output"), { BEC_BYPASS_PHRASES: JSON.stringify(["full output"]) }));
}

{
  for (const [command, runner] of [["pytest tests/", "pytest"], ["cd app && go test ./...", "go"], ["CI=1 npx vitest run", "js"]]) {
    const result = post(event(command));
    check(`post filter reuses ${runner} runner detection`, result.stopReason?.includes(`runner=${runner}`), result);
  }
  const background = post(event("go test ./...", { output: "ok example\n", exit_code: 0, session_id: 99 }));
  check("completed background Bash fixtures accept the original command", background.stopReason?.includes("runner=go exit=0"), background);
  for (const response of [
    "PASS example.test.js\n1 passed\n", "FAIL example.test.js\nAssertionError: expected true\n",
    JSON.stringify({ output: "tests passed\n", exit_code: 0 }),
    "Process exited with code 0\nFinal output:\nprinted by a failing test\n",
    { output: "working\n", session_id: 99 }, { output: "unknown status\n" }, { exit_code: 0 }, null,
  ]) {
    assertEmpty("pending or unknown response payloads pass through", post(event("npm test", response)));
  }
  assertEmpty("unassociated poll payloads pass through", post({ ...event(), tool_name: "write_stdin", tool_input: { session_id: 99 } }));
}

for (const directory of logs) rmSync(directory, { recursive: true, force: true });
cleanup();
