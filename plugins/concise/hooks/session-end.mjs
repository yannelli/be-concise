#!/usr/bin/env node
import { cleanupSession } from "./lib/state.mjs";
import { runHook } from "./lib/hook-main.mjs";

await runHook({ hook: "session-end", event: "SessionEnd" }, (input) => {
  cleanupSession(input.session_id);
  return {};
});
