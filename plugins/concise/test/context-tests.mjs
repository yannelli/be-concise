import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, run, ok } from "./lib.mjs";
import { setup, cleanup } from "./features-lib.mjs";
import { defaultConfig, loadConfig } from "../hooks/lib/config.mjs";
import { applyLayer } from "../hooks/lib/config-layers.mjs";
import { contextText } from "../hooks/lib/context.mjs";
import { modelCheckSettings } from "../scripts/model-check-settings.mjs";

const contextHook = join(ROOT, "hooks/session-context.mjs");
const event = (c, name, fields = {}) => ({ cwd: c.dir, session_id: c.sid, hook_event_name: name, ...fields });
const context = (result) => result.hookSpecificOutput?.additionalContext || "";

console.log("\ncontext and optional model hooks");

{
  const c = setup({ maxCommentLines: 4, maxFileLines: 450, features: { emDash: { enabled: true } } });
  for (const source of ["startup", "resume", "clear", "compact"]) {
    const output = run(contextHook, event(c, "SessionStart", { source }));
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(context(output), /at most 4 contiguous lines/);
    assert.match(context(output), /at most 450 lines/);
    assert.match(context(output), /emDash: confirm/);
    assert.match(context(output), /concise-ignore-file/);
    assert.match(context(output), /NOFILTER=1/);
  }
  const subagent = run(contextHook, event(c, "SubagentStart", { agent_id: "worker", agent_type: "Explore" }));
  assert.equal(subagent.hookSpecificOutput.hookEventName, "SubagentStart");
  assert.match(context(subagent), /at most 4 contiguous lines/);
  assert.deepEqual(run(contextHook, event(c, "UserPromptSubmit", { prompt: "Fix the code" })), {});
  ok("startup, resume, clear, compaction and subagents receive resolved context; turn reminders default off");
}

{
  const c = setup({ context: { perTurn: true }, bypass: { phrases: ["keep the wording"] } });
  const output = run(contextHook, event(c, "UserPromptSubmit", { prompt: "Fix the code" }));
  assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(context(output), /Active rules/);
  const bypass = run(contextHook, event(c, "UserPromptSubmit", { prompt: "KEEP THE WORDING" }));
  assert.equal(bypass.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(context(bypass), /Allowed by bypass/);
  assert.doesNotMatch(context(bypass), /Active rules/);
  assert.deepEqual(run(contextHook, event(c, "UserPromptSubmit", { prompt: "concise-ignore" })), {});
  ok("opt-in turn context respects bypasses and ignore markers");
}

{
  const c = setup({ context: { enabled: false } });
  assert.deepEqual(run(contextHook, event(c, "SessionStart")), {});
  const output = run(contextHook, event(c, "SessionStart"), { BEC_CONFIG_JSON: "{broken" });
  assert.match(context(output), /config ignored: BEC_CONFIG_JSON/);
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  const invalid = setup({ context: { perTurn: "true" }, testFilter: { codexPostToolUse: "false" }, subagentStop: { exemptAgentTypes: 4 } });
  const config = loadConfig(invalid.dir, {});
  assert.equal(config.context.perTurn, false);
  assert.equal(config.testFilter.codexPostToolUse, false);
  assert.deepEqual(config.subagentStop.exemptAgentTypes, []);
  assert.equal(config.problems.length, 3);
  assert.match(context(run(contextHook, event(invalid, "SessionStart"))), /expected a boolean/);
  ok("startup reports config failures even when context is disabled and rejects invalid opt-in flags");
}

{
  const config = applyLayer(applyLayer(defaultConfig(), { context: { perTurn: true }, subagentStop: { exemptAgentTypes: ["Explore"] } }), { context: { enabled: false } });
  assert.deepEqual(config.context, { enabled: false, perTurn: true });
  assert.deepEqual(config.subagentStop, { enabled: true, exemptAgentTypes: ["Explore"] });
  const off = defaultConfig();
  off.checks.comments = false;
  off.stopHook = false;
  off.features.emDash.enabled = true;
  assert.doesNotMatch(contextText(off), /Comments:/);
  assert.match(contextText(off), /reply checks off/);
  assert.deepEqual(modelCheckSettings(config), { hooks: {} });
  assert.throws(() => modelCheckSettings(config, "prompt,agent"), /evaluator must be/);
  for (const evaluator of ["prompt", "agent"]) {
    const settings = modelCheckSettings(config, evaluator);
    for (const name of ["Stop", "SubagentStop"]) {
      assert.equal(settings.hooks[name].length, 1);
      const [handler] = settings.hooks[name][0].hooks;
      assert.equal(handler.type, evaluator);
      assert.ok(handler.timeout <= 30);
      assert.match(handler.prompt, /stop_hook_active is true/);
      assert.match(handler.prompt, /softFail is true/);
      assert.match(handler.prompt, /concise-ignore/);
      assert.match(handler.prompt, /case-insensitive regular expression/);
      assert.match(handler.prompt, /"exemptAgentTypes":\["Explore"\]/);
      assert.match(handler.prompt, /Hook input: \$ARGUMENTS/);
    }
  }
  ok("model settings select one evaluator and include resolved rules, bypasses and bounded continuation");
}

{
  const c = setup({ maxRetries: 5 });
  const script = join(ROOT, "scripts/model-check-settings.mjs");
  const args = [script, "--cwd", c.dir, "--evaluator", "prompt"];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hooks.Stop[0].hooks[0].prompt, /"maxRetries":5/);
  writeFileSync(join(c.dir, ".claude/concise.json"), "{broken");
  const invalid = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  ok("model settings CLI snapshots project config and rejects invalid configuration");
}

{
  const manifest = JSON.parse(readFileSync(join(ROOT, ".codex-plugin/plugin.json"), "utf8"));
  const codex = JSON.parse(readFileSync(join(ROOT, manifest.hooks), "utf8"));
  const claude = JSON.parse(readFileSync(join(ROOT, "hooks/hooks.json"), "utf8"));
  for (const host of [codex, claude]) {
    for (const name of ["SessionStart", "SubagentStart", "UserPromptSubmit", "SubagentStop", "SessionEnd"]) assert.ok(host.hooks[name]?.length);
    assert.match(host.hooks.SessionStart[0].matcher, /compact/);
    assert.equal(host.hooks.SessionEnd[0].hooks[0].timeout, 1);
    assert.ok(Object.values(host.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks)).every((hook) => hook.type === "command"));
  }
  assert.ok(codex.hooks.PostToolUse);
  assert.ok(Object.values(codex.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks)).every((hook) => !("if" in hook)));
  const shellHooks = claude.hooks.PreToolUse.find((group) => group.matcher === "Bash").hooks;
  const matches = (condition, command) => new RegExp(`^${condition.slice(5, -1).split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]*")}$`).test(command);
  for (const [script, commands] of [
    ["check-bash.mjs", ["FOO=1 gh pr create --body x", "echo ok && git commit -m x", "echo $(gh issue comment 1 --body x)", "echo `git commit -m x`"]],
    ["monitor-filter.mjs", ["pytest", "npm test", "go test ./...", "FOO=1 npx jest", "echo $(vitest)", "echo ok && jest"]],
    ["check-edit.mjs", ["FOO=1 apply_patch <<'PATCH'\n*** Begin Patch\n*** End Patch\nPATCH", "python -c '*** Begin Patch\n*** End Patch'"]],
  ]) {
    for (const command of commands) assert.ok(shellHooks.some((hook) => hook.command.includes(script) && matches(hook.if, command)), command);
  }
  ok("host manifests wire lifecycle hooks, keep evaluators opt-in and retain command coverage");
}

cleanup();
