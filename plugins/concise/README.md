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

## Escape hatches

- `concise-ignore` inside a comment or PR body exempts that one instance.
- `concise-ignore-file` near the top of a file exempts the whole file.

## Known gaps

- `gh pr create --body-file <path>` is not inspected; only inline `--body`/`-b` and heredoc bodies are.
- Comment detection is heuristic, not a parser. A block-comment token that opens its own line inside a string literal can produce a false positive.

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
