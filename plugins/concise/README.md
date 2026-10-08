# concise

Concise is a Claude Code, Codex, and omp plugin that stops the agent's own verbose or machine-sounding writing before it lands. It runs as `PreToolUse` and `Stop` hooks, so a long comment, an oversized new file, a padded PR body, an em dash, or a flagged phrase is denied while the agent still holds the text. The agent reads the reason and sends a rewrite. Nothing reaches your working tree or GitHub in between.

## Quick start

Prerequisites: Git, Node.js, Bash, `jq`, `realpath`, and core Unix tools on `PATH`.

### 1. Install

Claude Code:

```text
/plugin marketplace add https://github.com/yannelli/be-concise
/plugin install concise@be-concise
```

Review the hooks and choose an installation scope. If the install summary requests it, run `/reload-plugins`.

Codex CLI 0.152.0 or newer:

```sh
codex plugin marketplace add yannelli/be-concise
codex plugin add concise@be-concise
```

Start a new Codex session, run `/hooks`, and review and trust each `concise` hook under both `PreToolUse` and `Stop`. Codex asks for review again when a hook definition changes, so trust the hooks again after an update. Automation that already validates its hook sources can pass `codex exec --dangerously-bypass-hook-trust "<prompt>"`. The bypass applies to that invocation and does not save trust.

omp (oh-my-pi):

```sh
omp plugin marketplace add yannelli/be-concise
omp plugin install concise@be-concise
```

Start a new omp session. omp loads the hooks as an extension at session start, so `/reload-plugins` does not pick them up.

The 3 core checks run right away. No config file is needed.

### 2. Copy the example config

```sh
cp plugins/concise/.claude/concise.json.example .claude/concise.json
```

Codex projects use `.codex/concise.json`. If both files exist, `.claude/concise.json` wins. omp reads the same two files.

### 3. Turn on the style checks

Both style checks ship disabled. Set `enabled` to `true` in the config file you just copied:

```json
{
  "features": {
    "emDash": { "enabled": true },
    "aiWriting": { "enabled": true, "preset": "default" }
  }
}
```

For one session instead, without touching the file:

```sh
BEC_FEATURE_ENABLE=emDash,aiWriting claude
```

### 4. Read the first deny

The agent writes `notes.md` holding `We delve into the parser.` The hook denies the `Write` and hands back this reason:

```text
[concise] AI writing patterns in /tmp/demo/notes.md: line 1 "delve" (vocabulary: look at, examine). Rewrite them. Reference: <plugin>/skills/concise-rules/references/ai-speak-patterns.md

To keep it, send the identical write again to confirm. To fix it, read <plugin>/skills/concise-rules/references/ai-speak-patterns.md.
```

### 5. Respond in one of 3 ways

1. Rewrite the flagged text. Send a `Write` holding `We read the parser.` The hook allows it.
2. Keep the text. Send the identical `Write` again. The hook allows it and reports `[concise] Kept after confirmation: 1 AI writing pattern in /tmp/demo/notes.md`.
3. Exempt the line. Put `concise-ignore` on it. The hook allows the write and reports nothing.

## What it checks

| Check | Trips on | Example |
|---|---|---|
| Comment length | A contiguous `//`, `#`, or `/* */` run over 2 lines | `[concise] Comment at /tmp/demo/a.js:1 is 3 lines (limit 2).` |
| File length | A new file over 300 lines, on `Write` or `*** Add File` | `[concise] /tmp/demo/big.js would be 305 lines (limit 300).` |
| PR and issue bodies | A `gh` body over 1 prose paragraph, or a paragraph over 3 sentences | `[concise] PR/issue body is too verbose: a paragraph has 4 sentences (limit 3)` |
| Em dashes | `U+2014`, plus `U+2013` when `enDash` is true, plus `--` between word characters when `doubleHyphen` is true | `The parser runs first — then it rejects the file.` |
| AI writing patterns | 47 categories of phrasing, commit hygiene, punctuation, and text statistics | `We delve into the parser.` |
| Dictionary | Terms you list in `features.dictionary.entries` | `[concise:dictionary:blacklist] 1 match at line 3: "blacklisted" (denylist).` |

A bulleted `## Summary` body is never flagged as a verbose PR body. Only unstructured prose is.

Every check reads the text being written, not the file on disk. An existing license header or an already-oversized file does not trip a one-line `Edit` or `*** Update File` hunk. The file length rule applies to `Write` and `*** Add File` only. In an `apply_patch`, each contiguous run of `+` lines is one chunk, and a `*** Move to:` target decides the comment syntax.

After 2 denied retries on the same target, the hook allows the action and flags it: `systemMessage` reaches the user and `additionalContext` reaches the agent in both hosts. A passing check resets that counter.

## Presets

`features.aiWriting.preset` picks the categories that run.

| Preset | Who it is for | What it turns on |
|---|---|---|
| `default` | Any project starting out | 21 high-precision phrase, commit, and punctuation categories. |
| `ryan` | A writer who wants the full house rules | 38 categories: everything except `ste` and the 5 statistics-only ones. |
| `technical` | API docs and code comments | 22 categories: `default` minus `formatting`, plus `file-narration` and `benefit-tail`, with 8 engineering words allowed. |
| `ste` | Procedures and text written for translation | 4 categories: `wordiness`, `hedging`, `copula`, and `ste`. |
| `minimal` | A team that only wants chat boilerplate gone | 4 categories: `chatbot`, `sycophancy`, `ai-identity`, and `ai-attribution`. |
| `git` | Commit messages, PR bodies, and reviews | 7 commit, PR, and review categories. |
| `statistical` | A writing audit over long documents | 10 text statistics categories. |
| `all` | Every rule, `ste` included | 47 categories. |

Pick one:

```json
{
  "features": {
    "aiWriting": { "enabled": true, "preset": "technical" }
  }
}
```

The 8 engineering words `technical` allows: `robust`, `comprehensive`, `seamless`, `ecosystem`, `leverage`, `facilitate`, `underpin`, and `streamline`.

Setting `features.aiWriting.categories` to a list of category ids replaces the preset's list. Setting `features.aiWriting.allow` adds words or phrases that are never flagged.

## Categories

The 47 categories fall into 5 groups.

| Group | Count | Flagged example | Fix |
|---|---|---|---|
| Phrase categories | 16 | `In conclusion` (`closers`) | End on the last fact. |
| Rhetorical categories | 11 | `studies show` (`vague-attribution`) | Cite the study. |
| Commit and review categories | 7 | `Co-authored-by: Claude` (`ai-attribution`) | Drop the trailer. |
| Punctuation categories | 3 | an arrow character (`unicode-glyphs`) | Use `->`. |
| Text statistics categories | 10 | passive voice over 30% of sentences (`passive-voice`) | Name the actor. |

The full table, with every category id, its presets, and the scopes it runs in, is in [docs/categories.md](docs/categories.md). The flagged text and the replacement for every pattern are in [skills/concise-rules/references/ai-speak-patterns.md](skills/concise-rules/references/ai-speak-patterns.md).

What gets scanned:

- Prose files (`md`, `mdx`, `markdown`, `txt`, `rst`, `adoc`, `asciidoc`) whole, with fenced blocks, inline code, URLs, and HTML comments blanked first.
- Comment runs in code files. Packs with the `code` scope, `hidden-characters` by default, read the whole file, string literals included.
- Notebook cells: a markdown cell as prose, a code cell as code.
- Files a shell command writes: a `cat` or `tee` heredoc before the command runs, and any other file the command changed in a git work tree after it runs.
- `gh pr`, `gh issue`, and `gh release` titles and bodies, inline, heredoc, or from a body file, and `gh api` request bodies.
- `git commit`, `git tag`, `git merge`, `git notes`, `jj`, and `hg` messages from `-m`, `--message=`, `-F`, `--trailer`, and the heredoc form.
- Text and files that MCP tools post or write, such as a PR body, a chat message, a doc page, or a pushed file.
- The plan that `ExitPlanMode` shows for approval, task text, and questions that `AskUserQuestion` asks you.
- The agent's final reply through the `Stop` hook when `replies` is true.

Each place past Write and Edit has an on-by-default switch under `scan`, listed in [docs/configuration.md](docs/configuration.md).

Not scanned: the agent's text between tool calls, because no hook can return it to the agent; page text in HTML files; and shell writes outside a git work tree. In Codex, shell writes are checked only for `cat` and `tee` heredocs. The omp extension checks neither MCP tools nor shell writes.

## Cloud agents and environment variables

A cloud agent that checks the repo out fresh carries no config file. Set the configuration in the environment:

```sh
export BEC_FEATURE_ENABLE=emDash,aiWriting
export BEC_ENABLE_PATTERNS=file-narration,benefit-tail
export BEC_HOOK_SOFT_FAIL=1
export BEC_LOG_ENABLED=1
```

Those 4 lines turn both style checks on, add 2 more categories, downgrade every deny to a flagged allow, and write one record per hook call to `~/.cache/concise/concise.log`.

The full variable table and 3 worked scenarios are in [docs/environment.md](docs/environment.md).

## Your own packs

Each category is one pack file. Add a team phrase in 8 lines. Save this as `.claude/concise/patterns/team-words.json`:

```json
{
  "id": "team-words",
  "feature": "aiWriting",
  "category": { "id": "team-words", "label": "team words" },
  "patterns": [{ "phrase": "synerg(?:y|ies)", "fix": "name the shared part" }]
}
```

Packs under `.claude/concise/patterns/` or `.codex/concise/patterns/` load with no config, and packs under `~/.config/concise/patterns/` load for every project. A pack of your own with no `presets` array runs under every preset. `features.aiWriting.packs` adds more files or directories. The `concise-web` Rules page switches packs on and off, adds packs from a URL, a path, or pasted JSON, and checks them for updates.

The full field list, the 3 pattern kinds, the `.mjs` script pack format with `detect(text, ctx)`, and the validator and renderer commands are in [docs/packs.md](docs/packs.md). A `.mjs` pack executes code from the checkout inside the hook process. Read one before you add it.

## Configuration

Every config key, the 5 config layers and their merge rules, `mode` and the confirm flow, `allowList`, `bypass`, `softFail`, the ignore globs, and the log format are in [docs/configuration.md](docs/configuration.md). [docs/INDEX.md](docs/INDEX.md) lists every doc.

To change settings from a session, ask the agent: the `concise-config` skill reads the settings, shows a diff, and writes it after you agree. The `concise-tune` skill reads samples of your writing and proposes settings that let it pass. Both run the CLI in [docs/tools.md](docs/tools.md), which you can also run yourself from the installed plugin directory (`${CLAUDE_PLUGIN_ROOT}` in a Claude Code session) or from `plugins/concise` in a checkout:

```sh
node scripts/concise-config.mjs show --cwd /path/to/project
node scripts/concise-config.mjs set features.aiWriting.preset ryan --cwd /path/to/project --apply
node scripts/concise-config.mjs tune ~/notes --kind docs --cwd /path/to/project
```

Claude Code also starts a `concise` MCP server with the same operations.

## Dictionary

`features.dictionary.entries` flags terms you list, with the fix you want. An entry matches by `exact`, `contains`, `startsWith`, `endsWith`, or `regex`, compares a word, a line, or the whole text, and can be limited to some hooks and scopes:

```json
{
  "features": {
    "dictionary": {
      "entries": [
        { "id": "blacklist", "match": "startsWith", "value": "blacklist", "fix": "denylist" },
        { "id": "hope-helps", "match": "endsWith", "on": "line", "value": "Hope this helps!", "fix": "end on the last fact", "hooks": ["stop"] }
      ]
    }
  }
}
```

A finding uses the same confirm flow as the other style checks. The fields are in [docs/configuration.md](docs/configuration.md#dictionary).

## Escape hatches

- `concise-ignore` inside a comment, a PR body, or a line of prose exempts that one instance.
- `concise-ignore-file` near the top of a file exempts the whole file.
- `ignoreGlobs` exempts matching paths from every check.
- `styleIgnoreGlobs` exempts matching paths from the style checks only.
- `allowList.phrases` and `allowList.patterns` drop single findings.
- `bypass.phrases` and `bypass.patterns` exempt the whole tool call.
- `softFail` turns every deny into a flagged allow.

## Known gaps

- `gh pr create --body-file <path>` is not inspected. Only inline `--body`, `-b`, and heredoc bodies are.
- `git commit -F <path>` and `--file` are not inspected. Only `-m`, repeated `-m`, `--message=`, and heredoc messages are.
- Hook contract tests cover Claude Code and Codex notices, approval handling, reply correction, and continuation guards. The omp tests drive the extension with a stand-in for omp. Live agent sessions are not part of the suite.
- omp has no subagent stop event, so omp subagent replies are not checked.
- The dash characters come from the built-in `prose/em-dash.json` file. A user pack with that id changes which scopes the dash check runs in, and `excludePacks` does not reach it. Turn `features.emDash.enabled` off instead.
- Activation is per category. `enablePatterns` with a pack id or a tag turns on the whole category that pack belongs to, and a user pack that reuses a built-in category id runs together with the built-in patterns under every preset either one is active in.
- A `.mjs` pack runs its top-level code and its `detect` in the hook process on every tool call, with your permissions. Read it before you add it.
- Tier-2 clustering counts distinct tier-2 patterns per paragraph across every active pack. One tier-2 hit from `vocabulary` and one from `ai-attribution` in the same paragraph report both.
- The statistical detectors return nothing under their minimum size: 150 to 300 words depending on the pack, and 8 list items over 2 lists for `terminal-punctuation`. The `minWords` option per pack lowers the floor.
- Under soft fail the log records `decision: "flag"`, the decision the hook wrote. The deny or block it replaced shows up only through `softFail: true` and the finding list.
- Comment detection uses token heuristics without a parser. A block-comment token that opens its own line inside a string literal can produce a false positive.
- Pattern detection is regex, so it produces false positives. Tune it with `allow`, `allowList`, `concise-ignore`, or an explicit `categories` list.
- `genuine change` without an article is not flagged. `a genuine change` is (`filler`). Adding the bare form to `inflation` would report the article form twice.

## How the hosts share one hook set

Both hosts expose `${CLAUDE_PLUGIN_ROOT}` to hook commands, so one `hooks/hooks.json` serves both. The Claude manifest is `.claude-plugin/plugin.json`, the Codex manifest is `.codex-plugin/plugin.json`, and the marketplaces are `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` at the repo root.

Claude Code sends `Write`, `Edit`, and `MultiEdit`. Codex sends `apply_patch` with the patch text in `tool_input.command`. Both are read the same way, and only the added lines count. `PreToolUse` notices reach each agent through `additionalContext`; a denial delivers its reason. Codex identifies turns with `turn_id` and does not support `permissionDecision: "ask"`, so Concise denies those calls with revision and user-approval instructions. Claude keeps its native approval prompt.

The reply hook reads `last_assistant_message` first, with a transcript fallback. A `Stop` block supplies the agent's correction instructions. Confirmation, bypass, and soft-fail notices remain terminal UI messages so they do not start another turn. These contracts follow the [Claude Code hook reference](https://code.claude.com/docs/en/hooks) and [Codex hook reference](https://developers.openai.com/codex/hooks/).

omp does not read `hooks/hooks.json`. Its marketplace install loads `omp/extension.mjs`, which `package.json` lists under `omp.extensions`. The extension turns each omp event into the input Claude Code would send and runs the same hook scripts. omp `write` becomes `Write`, `bash` becomes `Bash`, and each `edit` mode becomes the `apply_patch` text `check-edit` reads. A denial blocks the call with its reason, and a `Stop` block holds the reply. An `ask` opens omp's confirmation dialog when a UI is attached and denies the call otherwise, as in Codex. See [docs/host-features.md](docs/host-features.md#omp) for the event mapping.

## Test

```sh
node test/run-tests.mjs
```

The suite runs the Claude Code cases, then `test/codex-tests.mjs`, which feeds `apply_patch` payloads in the shape Codex 0.152 sends, then the `test/omp-*-tests.mjs` cases for the omp extension, and then a self-check that writes every file in this plugin through the hook under the `ryan` preset.

## License

[MIT](../../LICENSE)
