---
name: concise-rules
description: Reference for the concise plugin's verbosity rules, escape hatches, and config. Use when a "[concise]" hook message appears, or when asked to adjust its thresholds.
---

# Concise, verbosity rules

Three checks, enforced live via `PreToolUse` hooks, not just requested via instructions:

1. **Comments over the line limit** (default 2), any contiguous `//`, `#`, or `/* */` block. Only the text being written is scanned: the `content` of a `Write`, the `new_string` of an `Edit`, each `edits[].new_string` of a `MultiEdit`. Comments already on disk are never counted against you.
2. **Files over the line limit** (default 300). `Write` only, since an `Edit` is judged on its own text.
3. **`gh pr/issue` bodies with too many prose paragraphs** (default 1) or an overlong paragraph (default 3 sentences). A `## Summary` + bullets body is never flagged, only unstructured prose is.

## When a hook denies you

The deny carries a `permissionDecisionReason` naming the exact file/line or the exact paragraph problem. Fix that and retry. After 2 denied retries on the same target, the action goes through and is flagged for the user instead of blocking forever. A passing check resets that counter.

## Escape hatches

- `concise-ignore` inside a comment or PR body exempts that one instance.
- `concise-ignore-file` near the top of a file exempts the whole file.
- Path globs in `.claude/concise.json`'s `ignoreGlobs` exempt whole classes of files.

## Config

Copy `.claude/concise.json.example` to `.claude/concise.json` in the target project and edit thresholds there.
