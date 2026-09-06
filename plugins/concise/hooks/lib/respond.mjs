const preTool = (fields) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", ...fields } });

// systemMessage is a UI notice; additionalContext reaches the model in both hosts.
export function flagged(text, event = "PreToolUse") {
  return modelNotices({ systemMessage: text }, event);
}

export const deny = (reason) => preTool({ permissionDecision: "deny", permissionDecisionReason: reason });

export function ask(reason, input = {}) {
  // turn_id is a Codex extension; Codex rejects ask and continues the tool call.
  if (typeof input.turn_id === "string") {
    return deny(`${reason}\n\nCodex does not support hook approval prompts. Revise the flagged text, or ask the user to approve keeping it. After approval, retry with concise-ignore.`);
  }
  return preTool({ permissionDecision: "ask", permissionDecisionReason: reason, additionalContext: reason });
}

export function modelNotices(result, event) {
  const text = result.systemMessage;
  if (!text || !["PreToolUse", "PostToolUse", "SessionStart", "SubagentStart", "UserPromptSubmit"].includes(event)) return result;
  const output = result.hookSpecificOutput || {};
  const context = output.additionalContext || "";
  return {
    ...result,
    hookSpecificOutput: { ...output, hookEventName: event, additionalContext: context && !text.includes(context) ? `${context}\n\n${text}` : text },
  };
}

/** Keeps an allowed-with-flag text visible when a later check decided the call. */
export function mergeFlag(flagText, result) {
  if (!flagText) return result;
  return modelNotices({
    ...result,
    systemMessage: result.systemMessage ? `${flagText}\n\n${result.systemMessage}` : flagText,
  }, "PreToolUse");
}
