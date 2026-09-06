#!/usr/bin/env node
import { loadConfig } from "./lib/config.mjs";
import { bypassMatch, runHook } from "./lib/hook-main.mjs";
import { completedOutput, filteredFeedback, filterSettings, isCodexFilter } from "./lib/test-filter.mjs";

await runHook({ hook: "post-test-filter", event: "PostToolUse" }, (input, ctx) => {
  const config = loadConfig(input.cwd);
  ctx.config = config;
  if (!isCodexFilter(input) || config.testFilter?.codexPostToolUse !== true) return {};
  if (input.tool_name !== "Bash" || typeof input.tool_input?.command !== "string") return {};
  if (bypassMatch(input.tool_input.command, config)) {
    ctx.decision = "bypass";
    return {};
  }
  const result = completedOutput(input.tool_response);
  if (!result) return {};
  const settings = filterSettings(input);
  if (!settings) return {};
  ctx.decision = "filter";
  return { continue: false, stopReason: filteredFeedback(input.tool_response, result, settings) };
});
