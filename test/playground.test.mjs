import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { defaultConfig } from "../plugins/concise/hooks/lib/config.mjs";
import { disposeTests, runTest as inspectHooks } from "../plugins/concise/web/testing/runner.mjs";

after(disposeTests);

const runTest = (options) => inspectHooks({ env: { ...process.env, HOME: options.cwd, USERPROFILE: options.cwd }, ...options });

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), "concise-playground-test-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

function dashConfig() {
  const config = defaultConfig();
  config.features.emDash.enabled = true;
  return config;
}

test("playground runs Write checks and returns the unchanged hook response", async (t) => {
  const cwd = await fixture(t);
  const result = await runTest({ cwd, config: defaultConfig(), path: "example.js", text: "// one\n// two\n// three\nconst value = 1;" });
  assert.equal(result.hooks.length, 1);
  const hook = result.hooks[0];
  assert.equal(hook.hook, "check-edit");
  assert.equal(hook.decision, "deny");
  assert.equal(hook.exitCode, 0);
  assert.equal(hook.error, null);
  assert.equal(hook.source, "test");
  assert.deepEqual(JSON.parse(hook.stdout), hook.response);
  assert.match(hook.response.hookSpecificOutput.permissionDecisionReason, /3 lines/);
  assert.equal(existsSync(join(cwd, "example.js")), false);
});

test("playground retains confirmation state within a session and resets it on request", async (t) => {
  const cwd = await fixture(t);
  const options = { cwd, config: dashConfig(), text: "Keep this — wording." };
  const first = await runTest(options);
  assert.equal(first.hooks[0].decision, "deny");
  assert.equal(first.hooks[0].findings[0].category, "emDash");
  assert.equal(first.matches[0].line, 1);
  assert.match(first.matches[0].fix, /comma/);
  const second = await runTest({ ...options, session: first.session });
  assert.equal(second.hooks[0].decision, "flag");
  assert.match(second.hooks[0].stdout, /Kept after confirmation/);
  const reset = await runTest({ ...options, session: first.session, reset: true });
  assert.equal(reset.hooks[0].decision, "deny");
  const separate = await runTest(options);
  assert.equal(separate.hooks[0].decision, "deny");
  assert.notEqual(separate.session, first.session);
});

test("playground serializes concurrent requests sharing a confirmation session", async (t) => {
  const cwd = await fixture(t);
  const initial = await runTest({ cwd, config: dashConfig(), text: "Clean wording." });
  const results = await Promise.all([1, 2].map(() => runTest({
    cwd, config: dashConfig(), text: "Same — wording.", session: initial.session,
  })));
  assert.deepEqual(results.map((result) => result.hooks[0].decision), ["deny", "flag"]);
});

test("playground Stop uses a generated transcript and supports the follow-up Stop", async (t) => {
  const cwd = await fixture(t);
  const options = { cwd, config: dashConfig(), kind: "Stop", text: "This — reply." };
  const first = await runTest(options);
  assert.equal(first.hooks[0].hook, "check-reply");
  assert.equal(first.hooks[0].decision, "block");
  assert.equal(first.matches[0].scope, "reply");
  const second = await runTest({ ...options, session: first.session, stopHookActive: true });
  assert.equal(second.hooks[0].decision, "flag");
  assert.match(second.hooks[0].stdout, /Kept after confirmation/);
});

test("playground scans added apply_patch text without writing files", async (t) => {
  const cwd = await fixture(t);
  const text = "*** Begin Patch\n*** Add File: patch.md\n+This — phrase.\n*** End Patch";
  const result = await runTest({ cwd, config: dashConfig(), kind: "apply_patch", text });
  assert.equal(result.hooks[0].decision, "deny");
  assert.equal(result.matches[0].path, join(cwd, "patch.md"));
  assert.equal(existsSync(join(cwd, "patch.md")), false);
});

test("playground shows each Bash hook response without executing the command or its replacement", async (t) => {
  const cwd = await fixture(t);
  const marker = join(cwd, "executed");
  const command = `npm test && touch '${marker}'`;
  const result = await runTest({ cwd, config: defaultConfig(), kind: "Bash", text: command });
  assert.deepEqual(result.hooks.map((hook) => hook.hook), ["test-filter", "check-bash", "check-edit"]);
  assert.ok(result.hooks[0].response.hookSpecificOutput.updatedInput.command.includes("TF_CMD="));
  assert.ok(result.hooks.every((hook) => hook.request.tool_input.command === command && hook.exitCode === 0));
  assert.equal(existsSync(marker), false);
});

test("playground continues through matching Bash hooks after a denial", async (t) => {
  const cwd = await fixture(t);
  const result = await runTest({ cwd, config: dashConfig(), kind: "Bash", text: "git commit -m 'This — message.'" });
  assert.equal(result.hooks.length, 3);
  assert.equal(result.hooks[1].decision, "deny");
  assert.equal(result.hooks[2].hook, "check-edit");
  assert.equal(result.hooks[2].exitCode, 0);
  assert.ok(result.matches.some((match) => match.scope === "commit"));
});

test("playground returns all findings beyond the normal logger limit", async (t) => {
  const cwd = await fixture(t);
  const text = Array.from({ length: 30 }, (_, index) => `Line ${index} — wording.`).join("\n");
  const result = await runTest({ cwd, config: dashConfig(), text });
  assert.equal(result.matches.length, 30);
  assert.equal(result.hooks[0].findings.length, 30);
  assert.equal(result.hooks[0].counts.emDash, 30);
  assert.equal(result.matches[29].line, 30);
});

test("playground uses the config snapshot and isolates user environment, logging, and retry state", async (t) => {
  const cwd = await fixture(t);
  const home = join(cwd, "real-home");
  await mkdir(join(home, ".claude"), { recursive: true });
  const shellMarker = join(cwd, "sourced");
  const startup = join(cwd, "startup.sh");
  await writeFile(startup, `touch '${shellMarker}'\n`);
  await writeFile(join(home, ".claude", "test-filter.conf"), "FILTER_LINES=23\nFILTER_PATTERN='timeout'\n");
  const externalLog = join(cwd, "external.log");
  const statePath = join(cwd, "concise-state-external.json");
  await writeFile(statePath, "unchanged");
  const config = dashConfig();
  config.log = { ...config.log, enabled: true, path: externalLog };
  const env = { ...process.env, HOME: home, TMPDIR: cwd, BASH_ENV: startup, BEC_SOFT_FAIL: "1", BEC_ALWAYS_DISABLE_FEATURES: "emDash" };
  const result = await runTest({ cwd, env, config, text: "This — wording." });
  assert.equal(result.hooks[0].decision, "deny");
  assert.equal(existsSync(externalLog), false);
  assert.equal(await readFile(statePath, "utf8"), "unchanged");
  const bash = await runTest({ cwd, env, config, kind: "Bash", text: "npm test" });
  assert.match(bash.hooks[0].response.hookSpecificOutput.updatedInput.command, /TF_LINES=23/);
  assert.match(bash.hooks[0].response.hookSpecificOutput.updatedInput.command, /TF_PATTERN=timeout/);
  assert.equal(existsSync(shellMarker), false);
});

test("playground rejects unknown session IDs and replaces raw session and cwd fields", async (t) => {
  const cwd = await fixture(t);
  await assert.rejects(runTest({ cwd, session: "../../outside" }), /Unknown playground session/);
  const result = await runTest({ cwd, config: defaultConfig(), kind: "raw", event: {
    hook_event_name: "PreToolUse", tool_name: "Write", cwd: "/", session_id: "../../outside",
    tool_input: { file_path: join(cwd, "raw.md"), content: "Clean wording." },
  } });
  assert.equal(result.request.cwd, cwd);
  assert.equal(result.request.session_id, result.session);
  assert.match(result.session, /^[0-9a-f-]{36}$/);
  assert.equal(result.hooks[0].decision, "allow");
});

test("playground raw Stop uses supplied reply text and rejects external transcript paths", async (t) => {
  const cwd = await fixture(t);
  const result = await runTest({ cwd, config: dashConfig(), kind: "raw", event: {
    hook_event_name: "Stop", transcript_path: "/external/transcript", last_assistant_message: "This — reply.",
  } });
  assert.equal(result.hooks[0].decision, "block");
  assert.notEqual(result.request.transcript_path, "/external/transcript");
  await assert.rejects(runTest({ cwd, kind: "raw", event: { hook_event_name: "Stop", transcript_path: "/external/transcript" } }), /last_assistant_message/);
});
