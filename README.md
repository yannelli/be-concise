![Concise: Stops verbose comments, oversized files, and padded PRs.](plugins/concise/assets/github-banner.png)

# concise

Concise is a Claude Code and Codex plugin that catches the agent's own verbosity before a write or GitHub command runs. It also filters test-runner output before the agent reads it.

## What it checks

- Comment blocks longer than 2 lines in `Write`, `Edit`, `MultiEdit`, and Codex `apply_patch` additions
- New files longer than 300 lines
- Inline `gh pr` and `gh issue` bodies with more than 1 prose paragraph or more than 3 sentences in a paragraph
- Output from pytest, `go test`, npm test, Jest, and Vitest; the full output remains available at `/tmp/claude-test-last.log`

Structured GitHub bodies that use headings and lists are allowed. A denied call includes the exact limit and location. After 2 denied retries for the same target, Concise permits the next attempt and flags it.

## Install

Git, Node.js, Bash, `jq`, `realpath`, and core Unix tools must be available on `PATH`.

### Claude Code

Run these commands inside Claude Code:

```text
/plugin marketplace add https://github.com/yannelli/be-concise
/plugin install concise@be-concise
```

Review the hooks and choose an installation scope. If the install summary requests it, run `/reload-plugins`.

[Claude Code plugin documentation](https://code.claude.com/docs/en/discover-plugins)

### Codex

Codex CLI 0.152.0 or newer is the supported baseline.

```sh
codex plugin marketplace add yannelli/be-concise
codex plugin add concise@be-concise
```

Start a new Codex session, run `/hooks`, open `PreToolUse`, and review and trust each `concise` hook. Codex asks for review again when a hook definition changes.

For automation that already validates its hook sources:

```sh
codex exec --dangerously-bypass-hook-trust "<prompt>"
```

The bypass applies to that invocation and does not save trust.

[Codex plugin documentation](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)

## Configure

Create `.claude/concise.json` or `.codex/concise.json` in the target project:

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

If both files exist, Concise reads `.claude/concise.json` first.

## Optional style checks

The plugin ships 2 more checks, both disabled. Add a `features` block to the same config file to turn either one on.

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

Scanned text: prose files (`md`, `mdx`, `markdown`, `txt`, `rst`, `adoc`, `asciidoc`) whole, with fenced blocks, inline code, URLs, and HTML comments blanked first; comment runs in code files; `gh pr` and `gh issue` bodies; `git commit` messages from `-m`, `--message=`, and the heredoc form; and the agent's final reply through a `Stop` hook when `replies` is true.

`mode` decides what a finding does:

- `confirm` (the default): the call is denied once, with the line, the flagged text, and the fix. An identical retry goes through and is flagged as `[concise] Kept after confirmation:`. Different text is checked again from the start.
- `ask`: `PreToolUse` returns `permissionDecision: "ask"`, so you approve or reject the call yourself. On `Stop` it behaves as `confirm`.
- `deny`: denies until `maxRetries` is passed, then allows and flags, the same as the 3 verbosity checks.

The `Stop` hook reads the last assistant text block from the transcript and scans it as markdown under the virtual path `reply.md`, so `formatting` applies and `ignoreGlobs` do not. A blocked reply comes back to the agent with the finding. The same reply sent again is allowed and reported in a `systemMessage`.

The rules, the category table, and every flagged phrase with its replacement are in the skill under [plugins/concise/skills/concise-rules/references](plugins/concise/skills/concise-rules/references).

## Control test output

Bypass filtering for one command:

```sh
NOFILTER=1 pytest tests/
```

Adjust the output cap, match pattern, context, or tail length:

```sh
FILTER_LINES=300 FILTER_PATTERN='FAIL|timeout' FILTER_CONTEXT=10 FILTER_TAIL=20 go test ./...
```

Persistent defaults can live in `~/.claude/test-filter.conf` or `~/.codex/test-filter.conf`.

## Escape hatches

- `concise-ignore` exempts one comment or GitHub body.
- `concise-ignore-file` near the top of a file exempts the file.
- `ignoreGlobs` exempts matching paths.
- `NOFILTER=1` bypasses test-output filtering for one command.

## Known gaps

- `gh pr` and `gh issue` calls that use `--body-file` are not inspected.
- Comment detection uses token heuristics instead of a language parser.
- `git commit -F` and `--file` messages are not inspected; only `-m`, `--message=`, and heredoc messages are.
- `mode: "ask"` and the `Stop` reply check are tested with Claude Code payload shapes only. No live run in Claude Code or Codex was done.
- AI writing detection is regex, so it produces false positives. Tune it with `allow`, `concise-ignore`, or an explicit `categories` list.

## Development

```sh
node plugins/concise/test/run-tests.mjs
```

The detailed plugin reference lives in [plugins/concise/README.md](plugins/concise/README.md).

## Maintainer

[Ryan Yannelli (@yannelli)](https://github.com/yannelli)

## License

[MIT](LICENSE)
