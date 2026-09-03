# concise

Claude Code and Codex plugin that catches the agent's own verbosity (long comments, oversized files, padded PR/issue descriptions) and nudges a fix before you see it.

## What it checks

- Comments over 2 lines (any contiguous `//`, `#`, or `/* */` block) in the text being written
- Files over 300 lines, on `Write` (Claude Code) or `*** Add File` (Codex `apply_patch`)
- `gh pr create|comment|edit` / `gh issue create|comment` bodies with more than 1 prose paragraph, or a paragraph over 3 sentences (bulleted `## Summary`-style bodies are never flagged)

All checks run on `PreToolUse`, so a violation is blocked before the write or the `gh` call happens. Claude Code sends `Write`/`Edit`/`MultiEdit`; Codex sends `apply_patch` with the patch text in `tool_input.command`, and both are read the same way: only the added lines count.

## How it responds

Denies the tool call with a `permissionDecisionReason` naming exactly what is over the limit and where. The agent reads that reason and retries. After 2 failed retries on the same target, it lets the action through and flags it instead of blocking forever: as a `systemMessage` in Claude Code, and as `additionalContext` for the model in Codex, which drops `systemMessage` on `PreToolUse`. The counter also resets whenever a check passes, so one bad file doesn't buy a session-long exemption.

Edits are judged on the text being written, not the whole file: an existing license header or an already-oversized file will not trip a one-line `Edit` or `*** Update File` hunk. That means the file-length rule only applies to `Write` and `*** Add File`. In an `apply_patch`, each contiguous run of `+` lines is one chunk, and a `*** Move to:` target decides the comment syntax.

## Configure

Copy `.claude/concise.json.example` to `.claude/concise.json` (Claude Code) or `.codex/concise.json` (Codex) in your project and edit. If both exist, `.claude/concise.json` wins.

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

## Optional style checks

The plugin ships 2 more checks, both disabled. Turn either one on in the same config file.

- Em dash detection: the em dash (`U+2014`), plus the en dash (`U+2013`) when `enDash` is true, plus `--` between word characters or between spaces when `doubleHyphen` is true. A leading `--flag` never matches.
- AI writing patterns: 14 categories of phrasing, selected by preset or by an explicit list of category ids.

```json
{
  "features": {
    "emDash": {
      "enabled": true,
      "enDash": true,
      "doubleHyphen": false,
      "mode": "confirm",
      "replies": true
    },
    "aiWriting": {
      "enabled": true,
      "preset": "default",
      "categories": null,
      "allow": [],
      "mode": "confirm",
      "replies": true
    }
  }
}
```

Presets: `default`, `ryan` (every category except `ste`), `technical` (`default` minus `formatting`, with an allow list for words that carry a measured meaning), `ste` (`wordiness`, `hedging`, `copula`, and `ste`), `minimal` (`chatbot` and `sycophancy` only), and `all`.

Category ids: `vocabulary`, `wordiness`, `transitions`, `filler`, `hedging`, `chatbot`, `sycophancy`, `contrast`, `copula`, `inflation`, `closers`, `structure`, `formatting`, `ste`. Setting `categories` replaces the preset's list. Setting `allow` holds words or phrases that are never flagged.

What gets scanned: prose files (`md`, `mdx`, `markdown`, `txt`, `rst`, `adoc`, `asciidoc`) whole, with fenced blocks, inline code, URLs, and HTML comments blanked first; comment runs in code files; `gh pr` and `gh issue` bodies; `git commit` messages from `-m`, `--message=`, and the heredoc form; and the agent's final reply through a `Stop` hook when `replies` is true.

`mode` decides what a finding does:

- `confirm` (the default): the write is denied once, with the line, the flagged text, and the fix. An identical retry goes through and is flagged as `[concise] Kept after confirmation:`. Different text is checked again from the start.
- `ask`: `PreToolUse` returns `permissionDecision: "ask"`, so you approve or reject the call yourself. On `Stop` it behaves as `confirm`.
- `deny`: denies until `maxRetries` is passed, then allows and flags, the same as the 3 verbosity checks.

The `Stop` hook reads the last assistant text block from the transcript and scans it as markdown under the virtual path `reply.md`, so `formatting` applies and `ignoreGlobs` do not. A blocked reply comes back to the agent with the finding. The same reply sent again is allowed and reported in a `systemMessage`.

The rules, the category table, and every flagged phrase with its replacement are in the skill: [skills/concise-rules/references/avoid-ai-speak.md](skills/concise-rules/references/avoid-ai-speak.md), [skills/concise-rules/references/ai-speak-patterns.md](skills/concise-rules/references/ai-speak-patterns.md), and [skills/concise-rules/references/simplified-technical-english.md](skills/concise-rules/references/simplified-technical-english.md).

## Escape hatches

- `concise-ignore` inside a comment or PR body exempts that one instance.
- `concise-ignore-file` near the top of a file exempts the whole file.

## Known gaps

- `gh pr create --body-file <path>` is not inspected; only inline `--body`/`-b` and heredoc bodies are.
- Comment detection is heuristic, not a parser. A block-comment token that opens its own line inside a string literal can produce a false positive.
- `git commit -F <path>` and `--file` are not inspected; only `-m`, repeated `-m`, `--message=`, and heredoc messages are.
- `mode: "ask"` and the `Stop` reply check are tested with Claude Code payload shapes only. No live run in Claude Code or Codex was done.
- Pattern detection is regex, so it produces false positives. Tune it with `allow`, `concise-ignore`, or an explicit `categories` list.
- `genuine change` without an article is not flagged; `a genuine change` is (`filler`). Adding the bare form to `inflation` would report the article form twice.

## Install

Git, Node.js, Bash, `jq`, `realpath`, and core Unix tools must be available on `PATH`.

Claude Code:

```
/plugin marketplace add https://github.com/yannelli/be-concise
/plugin install concise@be-concise
```

Review the hooks and choose an installation scope. If the install summary requests it, run `/reload-plugins`.

Codex CLI 0.152.0 or newer:

```
codex plugin marketplace add yannelli/be-concise
codex plugin add concise@be-concise
```

Start a new Codex session, run `/hooks`, open `PreToolUse`, and review and trust each `concise` hook. Codex asks for review again when a hook definition changes. Automation that already validates its hook sources can pass `codex exec --dangerously-bypass-hook-trust "<prompt>"`; the bypass applies to that invocation and does not save trust.

Both hosts expose `${CLAUDE_PLUGIN_ROOT}` to hook commands, so one `hooks/hooks.json` serves both. The Claude manifest is `.claude-plugin/plugin.json`, the Codex manifest is `.codex-plugin/plugin.json`, and the marketplaces are `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` at the repo root.

## Test

```
node test/run-tests.mjs
```

Runs the Claude Code cases and then `test/codex-tests.mjs`, which feeds `apply_patch` payloads in the shape Codex 0.152 sends.
