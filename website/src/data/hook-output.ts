// Captured from plugins/concise/hooks/check-edit.mjs and check-bash.mjs with a throwaway HOME
// (shown as ~) and the project ~/code/billing-api. Long reference paths are cut at "Rewrite them."
export interface HookOutput {
  host: string;
  call: string;
  decision: 'deny' | 'allow';
  env?: string[];
  /** The tool input the agent sent, exactly as passed to the hook. */
  input?: string;
  response: string;
}

export const hookOutputs = {
  demo: {
    host: 'PreToolUse · check-edit', call: 'Write concise-demo.js', decision: 'deny',
    input: '// Read the input.\n// Check the value.\n// Return the result.',
    response: '[concise] Comment at ~/code/billing-api/concise-demo.js:1 is 3 lines (limit 2). Trim it to the one non-obvious point, or put "concise-ignore" inside it if it is a genuine exception.',
  },
  comment: {
    host: 'PreToolUse · check-edit', call: 'Write src/auth.ts', decision: 'deny',
    input: '// Check whether the provided user has\n// permission to access the resource.\n// First read their permissions list,\n// then look for the requested entry.\n// Return true when a match is found.\nexport function canAccess(user, resource) {\n  …',
    response: '[concise] Comment at ~/code/billing-api/src/auth.ts:1 is 5 lines (limit 2). Trim it to the one non-obvious point, or put "concise-ignore" inside it if it is a genuine exception.',
  },
  pr: {
    host: 'PreToolUse · check-bash', call: 'gh pr create --title "Round invoice totals" --body', decision: 'deny',
    input: 'This PR rounds invoice totals to whole cents. It also updates the tests.\n\nThe rounding now happens once, at the end.\n\nOverall, this change makes billing more reliable and robust.', // taste-skill-ignore: real hook output quoting flagged words
    response: '[concise] PR/issue body is too verbose: 3 prose paragraphs (limit 1), use short bullets instead. Use a short "## Summary" bullet list instead of prose paragraphs.',
  },
  docs: {
    host: 'PreToolUse · check-edit · technical preset', call: 'Write docs/billing.md', decision: 'deny',
    response: '[concise] AI writing patterns in ~/code/billing-api/docs/billing.md: line 3 "delves" (vocabulary: look at, examine); line 3 "game-changer" (inflation: state what changed); line 5 "In conclusion" (closers: cut, end on the last fact). Rewrite them. …\n\nTo keep it, send the identical write again to confirm. …', // taste-skill-ignore: real hook output quoting flagged words
  },
  softFail: {
    host: 'PreToolUse · check-edit · softFail', call: 'Write src/auth.ts', decision: 'allow',
    input: '// Check whether the provided user has\n// permission to access the resource.\n// First read their permissions list,\n// then look for the requested entry.\n// Return true when a match is found.\nexport function canAccess(user, resource) {\n  …',
    response: '[concise] soft-fail: Comment at ~/code/billing-api/src/auth.ts:1 is 5 lines (limit 2). Trim it to the one non-obvious point, or put "concise-ignore" inside it if it is a genuine exception.',
  },
  cloud: {
    host: 'PreToolUse · check-edit', call: 'Write docs/billing.md', decision: 'allow',
    env: ['export BEC_FEATURE_ENABLE=emDash,aiWriting', 'export BEC_ENABLE_PATTERNS=file-narration,benefit-tail', 'export BEC_HOOK_SOFT_FAIL=1', 'export BEC_LOG_ENABLED=1'],
    response: '[concise] soft-fail: AI writing patterns in ~/code/billing-api/docs/billing.md: line 3 "delves" (vocabulary: look at, examine). Rewrite them. …',
  },
} satisfies Record<string, HookOutput>;
