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

The deny carries a `permissionDecisionReason` naming the exact file/line or the exact paragraph problem. Fix that and retry. After 2 denied retries on the same target, the action goes through and is flagged: the user sees a `systemMessage`, and you see the same text as `additionalContext` in both hosts. A passing check resets that counter.

## Escape hatches

- `concise-ignore` inside a comment or PR body exempts that one instance.
- `concise-ignore-file` near the top of a file exempts the whole file.
- Path globs in `ignoreGlobs` (`.claude/concise.json` or `.codex/concise.json`) exempt whole classes of files.

## Config

Copy `.claude/concise.json.example` to `.claude/concise.json` (Claude Code) or `.codex/concise.json` (Codex) in the target project and edit thresholds there.

## Optional features

The 2 style checks ship disabled. Turn either one on per project in `.claude/concise.json` (Claude Code) or `.codex/concise.json` (Codex).

1. Em dash detection. Flags the em dash (`U+2014`). Flags the en dash (`U+2013`) when `enDash` is true. Flags `--` between word characters or between spaces when `doubleHyphen` is true. A `--flag` at the start of a token never matches.
2. AI writing patterns. Flags 44 categories of phrasing, commit hygiene, punctuation, and text statistics, shipped as pattern packs and selected by a preset or by an explicit category list.

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

`mode: "ask"` uses Claude Code's permission prompt and sends you the finding. In Codex, the call is denied: revise the text or ask the user to approve keeping it. After approval, retry with `concise-ignore`. Repeating the unchanged call stays denied. On `Stop`, `ask` behaves as `confirm`. `mode: "deny"` denies until `maxRetries` is passed, then allows and flags. When both features fire on one call, the strictest mode wins (`deny` over `ask` over `confirm`) and one message carries both parts.

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
      "replies": true,
      "packs": [],
      "excludePacks": [],
      "enablePatterns": [],
      "disablePatterns": [],
      "options": {}
    }
  }
}
```

`aiWriting.categories` replaces the preset's category list when it is set. `aiWriting.allow` holds words or phrases that are never flagged (case-insensitive substring match on the flagged text), merged with the preset's own allow list. `aiWriting.packs` lists extra pack files or directories, `aiWriting.excludePacks` drops packs by id, `aiWriting.enablePatterns` and `aiWriting.disablePatterns` add or drop categories on top of the preset by category id, pack id, or `tag:<tag>`, and `aiWriting.options` overrides a script pack's thresholds by pack id. Packs in `.claude/concise/patterns/` or `.codex/concise/patterns/` load without config.

### Environment control

Both features, the 3 core checks, and the `Stop` hook also answer to `BEC_` environment variables, so a session can differ from the project file. `BEC_FEATURE_ENABLE=emDash,aiWriting` turns the style checks on, and `BEC_FEATURE_ALWAYS_DISABLE=aiWriting` turns one off over the project file. Feature ids are `emDash`, `aiWriting`, `comments`, `fileSize`, `prBody`, and `stopHook`. `BEC_HOOK_SOFT_FAIL=1` downgrades every deny and block to a flagged allow, `BEC_DISABLE_STOP_HOOK=1` silences the reply check, and `BEC_LOG_ENABLED=1` writes one record per hook call to `~/.cache/concise/concise.log`. The `allowList` and `bypass` keys hold phrases and regex strings: an `allowList` entry drops the findings on a line, and a `bypass` entry allows the whole tool call with a flag. The full table is in [../../docs/environment.md](../../docs/environment.md).

### Presets

`default`, `ryan`, `technical`, `ste`, `minimal`, `git`, `statistical`, `all`. The category table with the preset membership of every category is in `references/avoid-ai-speak.md`; the phrase lists are in `references/ai-speak-patterns.md` and its numbered parts.

### Escape hatches that still apply

- `concise-ignore` on the line drops every style finding on that line.
- `concise-ignore-file` near the top of a file exempts the whole file.
- `ignoreGlobs` exempts matching paths from every check, and `styleIgnoreGlobs` from the style checks only. The `Stop` hook uses the virtual path `reply.md`, so globs do not apply to a reply.
- `aiWriting.allow` exempts a word or phrase everywhere.

### References

- [references/avoid-ai-speak.md](references/avoid-ai-speak.md): what to do when a `[concise]` style deny lands, the rules, the category table, and examples.
- [references/ai-speak-patterns.md](references/ai-speak-patterns.md) and its numbered parts: the flagged text and the replacement for every pattern, one section per category, generated from the pack files.
- [references/simplified-technical-english.md](references/simplified-technical-english.md): the ASD-STE100 rules and word choices behind the `ste` category.
