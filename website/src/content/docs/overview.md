# Concise documentation

Concise checks the agent’s own writing before a file write or GitHub command runs. It gives Claude Code, Codex, or omp a concrete reason to revise, and filters test output before the agent reads it.

Start with [installation](/docs/installation/) to set up your host and verify a hook. The three core checks work without a configuration file; the style checks are optional.

## Quick install

Run these inside Claude Code:

```text
/plugin marketplace add https://github.com/yannelli/be-concise
/plugin install concise@be-concise
```

Review the hooks and choose an installation scope. Run `/reload-plugins` if the install summary requests it.

For Codex CLI 0.152.0 or newer, run these in your terminal:

```sh
codex plugin marketplace add yannelli/be-concise
codex plugin add concise@be-concise
```

Start a new Codex session, run `/hooks`, and review and trust each Concise hook under `PreToolUse` and `Stop`.

For omp, run these in your terminal, then start a new omp session:

```sh
omp plugin marketplace add yannelli/be-concise
omp plugin install concise@be-concise
```

See [prerequisites and host setup](/docs/installation/) before installing. To watch the checks run, start the optional [web console](/docs/console/).

## What runs by default

| Check | Default limit | Where it applies |
| --- | --- | --- |
| Comment length | 2 lines per contiguous comment run | Added `//`, `#`, or `/* */` comments |
| New file length | 300 lines | `Write` and `*** Add File` |
| PR and issue bodies | 1 prose paragraph; 3 sentences per paragraph | Inline `gh pr` and `gh issue` bodies |

Only the pending text is checked. An existing license header or an already-large file does not trip a one-line `Edit` or `*** Update File` addition. In an `apply_patch`, each contiguous run of added lines is a chunk; a move target determines the comment syntax.

A bulleted `## Summary` body is not flagged as verbose prose. After two denied retries on one target, the next action is allowed and flagged, so the agent cannot be blocked forever. A passing check resets the counter.

## Optional style checks

The `emDash` and `aiWriting` features both ship disabled. Enable them in `.claude/concise.json` or `.codex/concise.json`:

```json
{
  "features": {
    "emDash": { "enabled": true },
    "aiWriting": { "enabled": true, "preset": "default" }
  }
}
```

There are eight AI-writing presets and 47 categories. The `default` preset selects 21 high-precision phrase, commit, and punctuation categories. [Configuration](/docs/configuration/) covers the keys and confirmation modes; [categories](/docs/categories/) lists the examples, scopes, and presets.

Style checks scan prose files, comments in code, GitHub bodies, supported commit-message forms, and final replies when `replies` is enabled. Fenced code, inline code, URLs, and HTML comments are blanked before prose-file scanning. Statistical checks need enough text to meet their pack’s minimum size.

## Control test output

The test filter handles matching Bash commands for pytest, `go test`, npm test, Jest, and Vitest. In Claude Code, a passing run reaches the agent as the matching lines and a short tail, and a failed run keeps its full output. Codex and omp rewrite the test command so the filter runs with it. Each run’s full output is saved in its own folder under `$TMPDIR`, and the filtered output prints the path:

```text
[filtered] runner=pytest exit=0 (cap 100)
[filtered] available output: cat '/tmp/concise-test-output-hS2x6f/output.log'
```

Bypass it for one command:

```sh
NOFILTER=1 pytest tests/
```

Adjust the cap, pattern, context, and tail:

```sh
FILTER_LINES=300 FILTER_PATTERN='FAIL|timeout' FILTER_CONTEXT=10 FILTER_TAIL=20 go test ./...
```

Persistent defaults can live in `~/.claude/test-filter.conf` or `~/.codex/test-filter.conf`. These are shell files sourced by the filter; only use configuration you trust. The [web console](/docs/console/) can edit them too.

## Find the right guide

- [Installation](/docs/installation/): prerequisites, the three hosts, hook trust, optional features, and sample denials.
- [Web console](/docs/console/): `concise-web` for settings, a hook playground, live activity, and pattern packs.
- [Configuration](/docs/configuration/): every default, the five layers, merge rules, confirm modes, ignore paths, and logging.
- [Categories](/docs/categories/): all 47 category ids, their presets and scopes, and example fixes.
- [Environment variables](/docs/environment/): every `BEC_` variable and cloud-agent, override, and logging examples.
- [Pattern packs](/docs/packs/): JSON and script formats, loading order, custom detectors, validation, and reference generation.
- [Settings tools](/docs/tools/): the `concise-config` CLI, the MCP server tools, and the tuner that fits settings to your writing samples.
- [Host features](/docs/host-features/): the Claude Code, Codex, and omp features that Concise uses, with dated sources.
- [Pattern library](/docs/ai-speak-patterns/): the flagged wording and suggested fix for each built-in pattern, in four parts.

The reference pages use the plugin’s Markdown sources.

## Exceptions and limits

Use `concise-ignore` for one comment, GitHub body, or line of prose, or `concise-ignore-file` near a file’s top for the whole file. `ignoreGlobs` exempts paths from every check; `styleIgnoreGlobs` affects only style checks. `allowList` drops individual findings, while `bypass` exempts a whole tool call. `softFail` changes denials into flagged allows. See the [configuration reference](/docs/configuration/) for their exact behavior.

Concise is a heuristic check, not a parser or a security boundary:

- Pattern matching and comment-token detection can produce false positives. Tune categories and allow lists for your project.
- `gh --body-file` bodies and `git commit -F` or `--file` inputs are not inspected. Use inline bodies and supported message forms when you want those checks.
- The test suite covers Claude Code and Codex hook contracts and drives the omp extension with a stand-in. Live agent sessions are not part of the suite.
- Codex does not support `ask` decisions, so Concise denies those calls with revision and approval instructions. omp opens its confirmation dialog when a UI is attached.
- omp has no subagent stop event, so omp subagent replies are not checked.
- Script packs execute with your permissions inside the hook process. Review their top-level code and `detect` function before loading them.
- Pack activation is per category. Selecting a pack id or tag can activate the whole category; a custom pack sharing a built-in category joins its activation.
- `excludePacks` does not disable the em-dash pack. Turn off `features.emDash.enabled` instead.

The [plugin README](https://github.com/yannelli/be-concise/blob/main/plugins/concise/README.md#known-gaps) records further detector-specific gaps. Report unexpected behavior in [GitHub issues](https://github.com/yannelli/be-concise/issues).
