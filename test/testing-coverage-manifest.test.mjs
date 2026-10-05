import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, mock } from "node:test";
import { defaultConfig } from "../plugins/concise/hooks/lib/config.mjs";
import { disposeTests, runTest } from "../plugins/concise/web/testing/runner.mjs";

after(disposeTests);

const SHELL_HOOK = 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/PreToolUse-test-filter.sh"';

function useManifest(t, hooks) {
  const readFile = fsPromises.readFile;
  mock.method(fsPromises, "readFile", (path, ...rest) =>
    String(path).endsWith(join("hooks", "hooks.json")) ? Promise.resolve(JSON.stringify({ hooks })) : readFile(path, ...rest));
  syncBuiltinESMExports();
  t.after(() => { mock.restoreAll(); syncBuiltinESMExports(); });
}

const bash = (command) => ({ kind: "raw", cwd: tmpdir(), config: defaultConfig(),
  event: { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } } });

test("events missing from the manifest and groups without hooks run nothing", async (t) => {
  useManifest(t, { PreToolUse: [{ matcher: "Bash" }] });
  assert.deepEqual((await runTest(bash("npm test"))).hooks, []);
  assert.deepEqual((await runTest({ kind: "raw", cwd: tmpdir(), config: defaultConfig(), event: { last_assistant_message: "Done." } })).hooks, []);
});

test("unknown manifest commands are rejected", async (t) => {
  useManifest(t, { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node other.mjs" }] }] });
  await assert.rejects(runTest(bash("npm test")), /Unsupported hook command: node other\.mjs/);
});

test("shell hooks run the Bash test filter script", async (t) => {
  useManifest(t, { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: SHELL_HOOK }] }] });
  const result = await runTest(bash("npm test"));
  assert.equal(result.hooks.length, 1);
  const [hook] = result.hooks;
  assert.equal(hook.hook, "test-filter");
  assert.equal(hook.exitCode, 0);
  assert.equal(hook.error, null);
  assert.match(hook.response.hookSpecificOutput.updatedInput.command, /^TF_CMD=npm\\ test .*PreToolUse-test-filter\.sh run$/);
});
