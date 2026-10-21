#!/usr/bin/env node
import { loadConfig } from "./lib/config.mjs";
import { bypassMatch, runHook } from "./lib/hook-main.mjs";
import { claudeOutput, completedOutput, filteredFeedback, filterSettings, isCodexFilter } from "./lib/test-filter.mjs";

await runHook({ hook: "post-test-filter", event: "PostToolUse" }, (input, ctx) => {
  const config = loadConfig(input.cwd);
  ctx.config = config;
  const codex = isCodexFilter(input);
  if (codex && config.testFilter?.codexPostToolUse !== true) return {};
  if (input.tool_name !== "Bash" || typeof input.tool_input?.command !== "string") return {};
  if (bypassMatch(input.tool_input.command, config)) {
    ctx.decision = "bypass";
    return {};
  }
  const result = codex ? completedOutput(input.tool_response) : claudeOutput(input.tool_response);
  if (!result) return {};
  const settings = filterSettings(input);
  if (!settings) return {};
  ctx.decision = "filter";
  const feedback = filteredFeedback(input.tool_response, result, settings);
  if (codex) return { continue: false, stopReason: feedback };
  // Claude Code sees only the replaced output; the command ran through its normal permission flow.
  const updatedToolOutput = { ...input.tool_response, stdout: feedback, stderr: "" };
  return { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput } };
});
