const preTool = (fields) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", ...fields } });

// Claude Code shows systemMessage to the user; Codex drops it, so the same text also
// goes to the model as additionalContext.
export function flagged(text) {
  return { systemMessage: text, ...preTool({ additionalContext: text }) };
}

export const deny = (reason) => preTool({ permissionDecision: "deny", permissionDecisionReason: reason });

export const ask = (reason) => preTool({ permissionDecision: "ask", permissionDecisionReason: reason });

/** Keeps an allowed-with-flag text visible when a later check decided the call. */
export function mergeFlag(flagText, result) {
  if (!flagText) return result;
  if (result.systemMessage) return flagged(`${flagText}\n\n${result.systemMessage}`);
  if (result.hookSpecificOutput) return { ...result, systemMessage: flagText };
  return flagged(flagText);
}
