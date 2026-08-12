# concise

Claude Code plugin that catches Claude's own verbosity — long comments, oversized files, padded PR/issue descriptions — and nudges a fix before you see it.

## What it checks

- Comments over 2 lines (any contiguous `//`, `#`, or `/* */` block)
- Files over 300 lines
- `gh pr create|comment|edit` / `gh issue create|comment` bodies with more than 1 prose paragraph, or a paragraph over 3 sentences (bulleted `## Summary`-style bodies are never flagged)

## How it responds

Denies the tool call with a `systemMessage` explaining exactly what's over the limit and where. Claude sees it and retries. After 2 failed retries on the same violation, it lets the action through and flags it instead of blocking forever.

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

## Install

```
/plugin install /home/ubuntu/projects/concise
```

## Test

```
node test/run-tests.mjs
```
