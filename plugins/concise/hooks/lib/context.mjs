export function contextText(config) {
  const lines = ["[concise] Active rules:"];
  if (config.checks.comments) lines.push(`Comments: at most ${config.maxCommentLines} contiguous lines in new text.`);
  if (config.checks.fileSize) lines.push(`New files: at most ${config.maxFileLines} lines.`);
  if (config.checks.prBody) lines.push(`PR/issue prose: at most ${config.maxPrBodyParagraphs} paragraphs and ${config.maxPrBodySentences} sentences per paragraph.`);
  const features = Object.entries(config.features).filter(([, value]) => value.enabled);
  for (const [name, feature] of features) {
    const detail = name === "aiWriting" ? `, preset ${feature.preset}` : "";
    lines.push(`${name}: ${feature.mode}${detail}; reply checks ${config.stopHook && feature.replies ? "on" : "off"}.`);
  }
  if (features.length === 0) lines.push("Style checks: off.");
  lines.push(`After ${config.maxRetries} nudges on a target, allow with a notice. Soft fail: ${config.softFail ? "on" : "off"}.`);
  lines.push("Escape hatches: concise-ignore for one finding; concise-ignore-file for a file; ignoreGlobs for paths. In confirm mode, repeat identical text to keep it.");
  if (config.bypass.phrases.length || config.bypass.patterns.length) lines.push(`Bypasses: ${JSON.stringify(config.bypass)}.`);
  lines.push(`Subagent reply checks: ${config.stopHook && config.subagentStop.enabled ? "on" : "off"}; exempt types: ${config.subagentStop.exemptAgentTypes.join(", ") || "none"}.`);
  lines.push("Test output: NOFILTER=1 bypasses filtering; FILTER_LINES, FILTER_PATTERN, FILTER_CONTEXT, FILTER_TAIL adjust it.");
  return lines.join("\n");
}

export function replyRules(config) {
  return {
    stopHook: config.stopHook,
    softFail: config.softFail,
    subagentStop: config.subagentStop,
    maxRetries: config.maxRetries,
    features: config.features,
    allowList: config.allowList,
    bypass: config.bypass,
  };
}
