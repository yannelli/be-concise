#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { loadConfig } from "./lib/config.mjs";
import { bypassMatch, runHook } from "./lib/hook-main.mjs";
import { filterScript, isCodexFilter } from "./lib/test-filter.mjs";

await runHook({ hook: "test-filter", event: "PreToolUse" }, (input, ctx) => {
  const config = loadConfig(input.cwd);
  ctx.config = config;
  if (isCodexFilter(input) && config.testFilter?.codexPostToolUse === true) return {};
  if (bypassMatch(input.tool_input?.command, config)) {
    ctx.decision = "bypass";
    return {};
  }
  const result = spawnSync("bash", [filterScript], {
    input: JSON.stringify(input), encoding: "utf8", timeout: 5000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Bash exited ${result.status}`);
  const response = JSON.parse(result.stdout || "{}");
  if (response.hookSpecificOutput?.updatedInput?.command) ctx.decision = "rewrite";
  return response;
});
