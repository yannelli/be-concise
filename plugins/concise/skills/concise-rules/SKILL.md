---
name: concise-rules
description: Reference for the concise plugin's verbosity rules, escape hatches, and config, in Claude Code and Codex. Use when a "[concise]" hook message appears, or when asked to adjust its thresholds.
---

# Concise, verbosity rules

The plugin runs 3 core checks as `PreToolUse` hooks, plus 2 optional style checks (see Optional features).

1. Comments over the line limit (default 2), any contiguous `//`, `#`, or `/* */` block. Only the text being written is scanned: the `content` of a `Write`, the `new_string` of an `Edit`, each `edits[].new_string` of a `MultiEdit`, and in Codex each run of `+` lines in an `apply_patch`. Comments already on disk are never counted against you.
2. Files over the line limit (default 300). `Write` and `*** Add File` only, since an `Edit` or `*** Update File` hunk is judged on its own text.
3. `gh pr/issue` bodies with too many prose paragraphs (default 1) or an overlong paragraph (default 3 sentences). A `## Summary` + bullets body is never flagged, only unstructured prose is.

## When a hook denies you

The deny carries a `permissionDecisionReason` naming the exact file/line or the exact paragraph problem. Fix that and retry. After 2 denied retries on the same target, the action goes through and is flagged instead of blocking forever: the user sees a `systemMessage` in Claude Code, and you see the same text as `additionalContext` in Codex. A passing check resets that counter.

## Escape hatches

- `concise-ignore` inside a comment or PR body exempts that one instance.
- `concise-ignore-file` near the top of a file exempts the whole file.
- Path globs in `ignoreGlobs` (`.claude/concise.json` or `.codex/concise.json`) exempt whole classes of files.

## Config

Copy `.claude/concise.json.example` to `.claude/concise.json` (Claude Code) or `.codex/concise.json` (Codex) in the target project and edit thresholds there.

## Optional features

The 2 style checks ship disabled. Turn either one on per project in `.claude/concise.json` (Claude Code) or `.codex/concise.json` (Codex).

1. Em dash detection. Flags the em dash (`U+2014`). Flags the en dash (`U+2013`) when `enDash` is true. Flags `--` between word characters or between spaces when `doubleHyphen` is true. A `--flag` at the start of a token never matches.
2. AI writing patterns. Flags 14 categories of phrasing, selected by a preset or by an explicit category list.

### What gets scanned

- Prose files (`md`, `mdx`, `markdown`, `txt`, `rst`, `adoc`, `asciidoc`): the whole written text. Fenced blocks, inline code, URLs, and HTML comments are blanked first, so an example inside backticks is exempt.
- Code files: comment runs only, the same runs the comment-length check reads. String literals and code are never scanned.
- Every other extension (`json`, `csv`, lock files, unknown): nothing.
- `gh pr` and `gh issue` bodies, inline `--body` and heredoc forms.
- `git commit` messages from `-m`, repeated `-m`, `--message=`, and the heredoc form.
- Your final chat reply, through the `Stop` hook, when `replies` is true.

Only the text being written is scanned, as with the other 3 checks.

### The confirm flow

`mode` defaults to `confirm`:

1. The first write carrying a finding is denied. The reason names the file, the line, the flagged text, the fix, and a reference path.
2. To keep the text, send the identical write again. The hook allows it and flags it with `[concise] Kept after confirmation:`.
3. To fix the text, send different text. The hook checks the new text from the start.
4. After `maxRetries` denials on the same target, the write goes through and is flagged.

`mode: "ask"` returns `permissionDecision: "ask"` on `PreToolUse`, so the user decides. On `Stop` it behaves as `confirm`. `mode: "deny"` denies until `maxRetries` is passed, then allows and flags. When both features fire on one call, the strictest mode wins (`deny` over `ask` over `confirm`) and one message carries both parts.

### Feature config

```json
{
  "maxCommentLines": 2,
  "maxFileLines": 300,
  "maxPrBodyParagraphs": 1,
  "maxPrBodySentences": 3,
  "maxRetries": 2,
  "ignoreGlobs": ["**/node_modules/**"],
  "features": {
    "emDash": {
      "enabled": false,
      "enDash": true,
      "doubleHyphen": false,
      "mode": "confirm",
      "replies": true
    },
    "aiWriting": {
      "enabled": false,
      "preset": "default",
      "categories": null,
      "allow": [],
      "mode": "confirm",
      "replies": true
    }
  }
}
```

`aiWriting.categories` replaces the preset's category list when it is set. `aiWriting.allow` holds words or phrases that are never flagged (case-insensitive substring match on the flagged text), merged with the preset's own allow list.

### Presets

`default`, `ryan`, `technical`, `ste`, `minimal`, `all`. Category ids: `vocabulary`, `wordiness`, `transitions`, `filler`, `hedging`, `chatbot`, `sycophancy`, `contrast`, `copula`, `inflation`, `closers`, `structure`, `formatting`, `ste`. Preset membership per category is in `references/avoid-ai-speak.md`.

### Escape hatches that still apply

- `concise-ignore` on the line drops every style finding on that line.
- `concise-ignore-file` near the top of a file exempts the whole file.
- `ignoreGlobs` exempts matching paths. The `Stop` hook uses the virtual path `reply.md`, so globs do not apply to a reply.
- `aiWriting.allow` exempts a word or phrase everywhere.

### References

- [references/avoid-ai-speak.md](references/avoid-ai-speak.md): what to do when a `[concise]` style deny lands, the rules, the category table, and examples.
- [references/ai-speak-patterns.md](references/ai-speak-patterns.md) and [references/ai-speak-patterns-2.md](references/ai-speak-patterns-2.md): the flagged text and the replacement for every pattern, one section per category.
- [references/simplified-technical-english.md](references/simplified-technical-english.md): the ASD-STE100 rules and word choices behind the `ste` category.
