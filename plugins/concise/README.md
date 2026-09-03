# concise

Claude Code plugin that catches Claude's own verbosity (long comments, oversized files, padded PR/issue descriptions) and nudges a fix before you see it.

## What it checks

- Comments over 2 lines (any contiguous `//`, `#`, or `/* */` block) in the text being written
- Files over 300 lines, on `Write`
- `gh pr create|comment|edit` / `gh issue create|comment` bodies with more than 1 prose paragraph, or a paragraph over 3 sentences (bulleted `## Summary`-style bodies are never flagged)

All checks run on `PreToolUse`, so a violation is blocked before the write or the `gh` call happens.

## How it responds

Denies the tool call with a `permissionDecisionReason` naming exactly what is over the limit and where. Claude reads that reason and retries. After 2 failed retries on the same target, it lets the action through and flags it for you with a `systemMessage` instead of blocking forever; the counter also resets whenever a check passes, so one bad file doesn't buy a session-long exemption.

Edits are judged on the text being written, not the whole file: an existing license header or an already-oversized file will not trip a one-line `Edit`. That means the file-length rule only applies to `Write`.

## Configure

Copy `.claude/concise.json.example` to `.claude/concise.json` in your project and edit:

```json
{
  "maxCommentLines": 2,
  "maxFileLines": 300,
  "maxPrBodyParagraphs": 1,
  "maxPrBodySentences": 3,
  "maxRetries": 2,
  "ignoreGlobs": ["**/node_modules/**", "**/*.generated.*"]
}
```

## Escape hatches

- `concise-ignore` inside a comment or PR body exempts that one instance.
- `concise-ignore-file` near the top of a file exempts the whole file.

## Known gaps

- `gh pr create --body-file <path>` is not inspected; only inline `--body`/`-b` and heredoc bodies are.
- Comment detection is heuristic, not a parser. A block-comment token that opens its own line inside a string literal can produce a false positive.

## Install

```
/plugin install /path/to/concise
```

## Test

```
node test/run-tests.mjs
```
