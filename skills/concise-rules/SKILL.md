---
name: concise-rules
description: Reference for the concise plugin's verbosity rules, escape hatches, and config. Use when a "[concise]" hook message appears, or when asked to adjust its thresholds.
---

# Concise — verbosity rules

Three checks, enforced live via hooks, not just requested via instructions:

1. **Comments over the line limit** (default 2) — any contiguous `//`, `#`, or `/* */` block.
2. **Files over the line limit** (default 300).
3. **`gh pr/issue` bodies with too many prose paragraphs** (default 1) or an overlong paragraph (default 3 sentences). A `## Summary` + bullets body is never flagged — only unstructured prose is.

## When a hook denies you

The `systemMessage` names the exact file/line or the exact paragraph problem. Fix it and retry. After 2 denied retries on the same violation, it lets the action through and flags it for the user instead of blocking forever.

## Escape hatches

- `concise-ignore` inside a comment or PR body exempts that one instance.
- `concise-ignore-file` near the top of a file exempts the whole file.
- Path globs in `.claude/concise.json`'s `ignoreGlobs` exempt whole classes of files.

## Config

Copy `.claude/concise.json.example` to `.claude/concise.json` in the target project and edit thresholds there.
