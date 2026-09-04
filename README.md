![Concise: Stops verbose comments, oversized files, and padded PRs.](plugins/concise/assets/github-banner.png)

# concise

Concise is a Claude Code and Codex plugin that catches the agent's own verbosity before a write or GitHub command runs. It also filters test-runner output before the agent reads it.

New here? Start with [plugins/concise/README.md](plugins/concise/README.md).

## What it checks

- Comment blocks longer than 2 lines in `Write`, `Edit`, `MultiEdit`, and Codex `apply_patch` additions
- New files longer than 300 lines
- Inline `gh pr` and `gh issue` bodies with more than 1 prose paragraph or more than 3 sentences in a paragraph
- Em dashes and 44 categories of AI writing patterns, both off until you turn them on
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

## Documentation

- [plugins/concise/README.md](plugins/concise/README.md): the entry point. Quick start, what each check does, the 8 presets, and the escape hatches.
- [plugins/concise/docs/configuration.md](plugins/concise/docs/configuration.md): every config key with its default, the 5 config layers, `mode`, `allowList`, `bypass`, and logging.
- [plugins/concise/docs/categories.md](plugins/concise/docs/categories.md): all 44 AI writing categories with an example, a fix, the presets, and the scopes.
- [plugins/concise/docs/environment.md](plugins/concise/docs/environment.md): every `BEC_` variable and 3 worked scenarios, including a cloud agent with no config file.
- [plugins/concise/docs/packs.md](plugins/concise/docs/packs.md): the pack file format, the 3 pattern kinds, `detect(text, ctx)`, and the validator and renderer commands.

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

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the `dev` → `main` workflow, Conventional Commits, and automated semantic releases.

```sh
node plugins/concise/test/run-tests.mjs
```

The suite runs the Claude Code cases, then `plugins/concise/test/codex-tests.mjs`, which feeds `apply_patch` payloads in the shape Codex 0.152 sends, and then a self-check that writes every file in the plugin through the hook under the `ryan` preset.

## Maintainer

[Ryan Yannelli (@yannelli)](https://github.com/yannelli)

## License

[MIT](LICENSE)
