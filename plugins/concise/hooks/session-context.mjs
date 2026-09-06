#!/usr/bin/env node
import { loadConfig } from "./lib/config.mjs";
import { contextText } from "./lib/context.mjs";
import { runHook, bypassResult } from "./lib/hook-main.mjs";

await runHook({ hook: "session-context", event: "SessionStart" }, (input, ctx) => {
  const config = loadConfig(input.cwd);
  ctx.config = config;
  const event = input.hook_event_name || "SessionStart";
  if (!["SessionStart", "SubagentStart", "UserPromptSubmit"].includes(event)) return {};
  if (!config.context.enabled || (event === "UserPromptSubmit" && !config.context.perTurn)) return {};
  if (event === "UserPromptSubmit") {
    const bypass = bypassResult(input.prompt || "", config, ctx, event);
    if (bypass) return bypass;
    if ((input.prompt || "").includes("concise-ignore")) return {};
  }
  return { hookSpecificOutput: { hookEventName: event, additionalContext: contextText(config) } };
});
