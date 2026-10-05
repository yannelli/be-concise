import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test, { after } from "node:test";
import { defaultConfig } from "../plugins/concise/hooks/lib/config.mjs";
import { disposeTests, runTest } from "../plugins/concise/web/testing/runner.mjs";

after(disposeTests);

const DASH = "\u2014";
const LIMIT = 1024 * 1024;

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), "concise-runner-test-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return { cwd, env: { ...process.env, HOME: cwd, USERPROFILE: cwd } };
}

function dashConfig() {
  const config = defaultConfig();
  config.features.emDash.enabled = true;
  return config;
}

async function fakeBash(cwd, name, script) {
  const bin = join(cwd, name);
  await mkdir(bin);
  await writeFile(join(bin, "bash"), `#!/bin/sh\ncat >/dev/null\n${script}\n`);
  await chmod(join(bin, "bash"), 0o755);
  return `${bin}${delimiter}${process.env.PATH}`;
}

test("runTest rejects oversized, malformed, and unsupported requests", async (t) => {
  const { cwd, env } = await fixture(t);
  const config = defaultConfig();
  const reject = (options, pattern) => assert.rejects(runTest({ cwd, env, config, ...options }), pattern);
  await reject({ text: "x".repeat(LIMIT + 1) }, /Test input exceeds 1 MiB/);
  await reject({ kind: "raw", event: { tool_name: "Write", tool_input: { file_path: join(cwd, "a.md"), content: "x".repeat(LIMIT) } } }, /Test input exceeds 1 MiB/);
  await reject({ path: 5 }, /Text and path must be strings/);
  for (const event of [undefined, "Stop", []]) await reject({ kind: "raw", event }, /Raw event must be an object/);
  await reject({ kind: "Read" }, /Unsupported playground tool: Read/);
  await reject({ kind: "raw", event: { hook_event_name: "PostToolUse", tool_name: "Write" } }, /Unsupported hook event/);
});

test("runTest infers the raw event name and skips tools without hooks", async (t) => {
  const { cwd, env } = await fixture(t);
  const config = dashConfig();
  const write = await runTest({ cwd, env, config, kind: "raw", event: { tool_name: "Write", tool_input: { file_path: join(cwd, "a.md"), content: "Clean." } } });
  assert.equal(write.request.hook_event_name, "PreToolUse");
  assert.deepEqual(write.hooks.map((hook) => [hook.hook, hook.decision]), [["check-edit", "allow"]]);
  const stop = await runTest({ cwd, env, config, kind: "raw", event: { last_assistant_message: `Reply ${DASH} here.` } });
  assert.equal(stop.request.hook_event_name, "Stop");
  assert.deepEqual(stop.hooks.map((hook) => [hook.hook, hook.tool, hook.decision]), [["check-reply", null, "block"]]);
  assert.deepEqual(stop.matches.map(({ category }) => category), ["emDash"]);
  const none = await runTest({ cwd, env, config, kind: "raw", event: { hook_event_name: "PreToolUse" } });
  assert.deepEqual(none.hooks, []);
});

test("runTest defaults to the process cwd and environment", async (t) => {
  const { cwd } = await fixture(t);
  const previous = process.cwd();
  process.chdir(cwd);
  t.after(() => process.chdir(previous));
  const result = await runTest({ config: defaultConfig(), text: "Clean." });
  assert.equal(result.request.cwd, process.cwd());
  assert.equal(result.hooks[0].decision, "allow");
});

test("runTest labels bypassed calls and runs check-reply for subagent handbacks", async (t) => {
  const { cwd, env } = await fixture(t);
  const config = { ...dashConfig(), bypass: { phrases: ["let it pass"], patterns: [] } };
  const bypass = await runTest({ cwd, env, config, text: `Text ${DASH} here. let it pass` });
  assert.equal(bypass.hooks[0].decision, "bypass");
  const handback = await runTest({ cwd, env, config: dashConfig(), kind: "raw", event: {
    hook_event_name: "PreToolUse", tool_name: "SubagentHandback", tool_input: { message: `Report ${DASH} here.` },
  } });
  assert.equal(handback.hooks[0].hook, "check-reply");
  assert.equal(handback.hooks[0].decision, "deny");
  assert.deepEqual(handback.hooks[0].findings.map(({ category }) => category), ["emDash"]);
  assert.deepEqual(handback.matches.map(({ category, hook }) => [category, hook]), [["emDash", "check-reply"]]);
});

test("runTest copies the test filter config from USERPROFILE and works without a home", async (t) => {
  const { cwd } = await fixture(t);
  const { HOME, USERPROFILE, ...rest } = process.env;
  await mkdir(join(cwd, ".codex"));
  await writeFile(join(cwd, ".codex", "test-filter.conf"), "FILTER_LINES=23\n");
  const profile = await runTest({ cwd, env: { ...rest, USERPROFILE: cwd }, config: defaultConfig(), kind: "Bash", text: "npm test" });
  assert.match(profile.hooks[0].response.hookSpecificOutput.updatedInput.command, /TF_LINES=23/);
  const homeless = await runTest({ cwd, env: rest, config: defaultConfig(), kind: "Bash", text: "npm test" });
  assert.equal(homeless.hooks[0].decision, "rewrite");
  assert.doesNotMatch(homeless.hooks[0].response.hookSpecificOutput.updatedInput.command, /TF_LINES=23/);
});

test("runTest rejects a test filter config it cannot read", async (t) => {
  const { cwd, env } = await fixture(t);
  await mkdir(join(cwd, ".claude", "test-filter.conf"), { recursive: true });
  await assert.rejects(runTest({ cwd, env, config: defaultConfig(), kind: "Bash", text: "npm test" }), { code: "EISDIR" });
});

test("runTest reports invalid hook responses, internal errors, and context-only flags", async (t) => {
  const { cwd, env } = await fixture(t);
  const filter = async (name, script) => {
    const PATH = await fakeBash(cwd, name, script);
    const result = await runTest({ cwd, env: { ...env, PATH }, config: defaultConfig(), kind: "Bash", text: "npm test" });
    assert.equal(result.hooks[0].hook, "test-filter");
    return result.hooks[0];
  };
  const number = await filter("number", "printf 5");
  assert.equal(number.decision, "error");
  assert.equal(number.error, "Invalid hook response: Expected a JSON object");
  assert.deepEqual(number.response, {});
  const failed = await filter("failed", "echo boom >&2; exit 1");
  assert.equal(failed.decision, "error");
  assert.match(failed.error, /^\[concise\] internal error, allowing: boom/);
  const context = await filter("context", "printf '{\"hookSpecificOutput\":{\"additionalContext\":\"note\"}}'");
  assert.equal(context.decision, "flag");
  assert.equal(context.error, null);
});

test("runTest reports worker scan failures", async (t) => {
  const { cwd, env } = await fixture(t);
  const result = await runTest({ cwd, env, config: dashConfig(), kind: "raw", event: {
    hook_event_name: "PreToolUse", tool_name: "apply_patch", tool_input: { command: 123 },
  } });
  assert.equal(result.hooks[0].decision, "error");
  assert.match(result.hooks[0].error, /^Match diagnostics: /);
});

test("runTest drops sessions whose directory cannot be created", async (t) => {
  const { cwd, env } = await fixture(t);
  await disposeTests();
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = join(cwd, "missing");
  t.after(() => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  });
  for (let i = 0; i < 70; i += 1) {
    await assert.rejects(runTest({ cwd, env, config: defaultConfig() }), { code: "ENOENT" });
  }
});

test("runTest limits the number of open sessions", async (t) => {
  const { cwd, env } = await fixture(t);
  await disposeTests();
  for (let i = 0; i < 64; i += 1) {
    await assert.rejects(runTest({ cwd, env, config: defaultConfig(), path: 5 }), /Text and path must be strings/);
  }
  await assert.rejects(runTest({ cwd, env, config: defaultConfig() }), /Playground session limit reached/);
  await disposeTests();
  const result = await runTest({ cwd, env, config: defaultConfig(), text: "Clean." });
  assert.equal(result.hooks[0].decision, "allow");
});
