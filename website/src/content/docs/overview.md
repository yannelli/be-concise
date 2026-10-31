# Concise documentation

Concise does a check of the text that the agent writes before a file write or a GitHub command runs. It gives Claude Code, Codex, or omp a specific reason to change the text. Concise also filters test output before the agent reads it.

To set up your host and make sure that a hook works, start with [installation](/docs/installation/). The 3 core checks work without a configuration file. The style checks are optional.

## Quick install

Run these commands in Claude Code:

```text
/plugin marketplace add https://github.com/yannelli/be-concise
/plugin install concise@be-concise
```

Then do these steps:

1. Review the hooks.
2. Select an installation scope.
3. If the install summary tells you to reload the plugins, run `/reload-plugins`.

If you use Codex CLI 0.152.0 or newer, run these commands in your terminal:

```sh
codex plugin marketplace add yannelli/be-concise
codex plugin add concise@be-concise
```

Then do these steps:

1. Start a new Codex session.
2. Run `/hooks`.
3. Review each Concise hook under `PreToolUse` and `Stop`.
4. Trust each Concise hook under `PreToolUse` and `Stop`.

If you use omp, run these commands in your terminal:

```sh
omp plugin marketplace add yannelli/be-concise
omp plugin install concise@be-concise
```

Then start a new omp session.

Before you install, read [prerequisites and host setup](/docs/installation/). To see the checks when they run, start the [web console](/docs/console/). The web console is optional.

## What runs by default

| Check | Default limit | Where it applies |
| --- | --- | --- |
| Comment length | 2 lines per contiguous comment run | Added `//`, `#`, or `/* */` comments |
| New file length | 300 lines | `Write` and `*** Add File` |
| PR and issue bodies | 1 prose paragraph, 3 sentences per paragraph | Inline `gh pr` and `gh issue` bodies |

The checks apply only to the text in the tool call, before the tool call runs. A license header that is already in a file does not cause a one-line `Edit` or `*** Update File` addition to fail. A file that is already large also does not cause that addition to fail. In an `apply_patch`, each contiguous run of added lines is a chunk. If the patch moves a file, the move target sets the comment syntax.

Concise does not flag a bulleted `## Summary` body as verbose prose. After 2 denied retries on one target, Concise allows and flags the next action. Thus, Concise cannot block the agent forever. When a check passes, Concise resets the counter.

## Optional style checks

The `emDash` and `aiWriting` features are disabled by default. To enable them, add this to `.claude/concise.json` or `.codex/concise.json`:

```json
{
  "features": {
    "emDash": { "enabled": true },
    "aiWriting": { "enabled": true, "preset": "default" }
  }
}
```

There are 8 AI-writing presets and 47 categories. The `default` preset selects 21 phrase, commit, and punctuation categories that have high precision. [Configuration](/docs/configuration/) gives the keys and the confirmation modes. [Categories](/docs/categories/) gives the examples, scopes, and presets.

The style checks apply to these types of text:

- Prose files
- Comments in code
- GitHub bodies
- Supported commit-message forms
- Final replies, if `replies` is enabled

Before Concise does a check of a prose file, it replaces fenced code, inline code, URLs, and HTML comments with blank text. Statistical checks need enough text to meet the minimum size of their pack.

## Control test output

The test filter applies to Bash commands that match pytest, `go test`, npm test, Jest, and Vitest. In Claude Code, if a run passes, the agent gets the lines that match and a short tail. If a run fails, the agent gets the full output. Codex and omp change the test command so that the filter runs with it. The full output of each run is saved in a separate folder under `$TMPDIR`, and the filtered output shows the path:

```text
[filtered] runner=pytest exit=0 (cap 100)
[filtered] available output: cat '/tmp/concise-test-output-hS2x6f/output.log'
```

To bypass the filter for one command, run the command as this example shows:

```sh
NOFILTER=1 pytest tests/
```

To change the cap, the pattern, the context, and the tail, set these variables:

```sh
FILTER_LINES=300 FILTER_PATTERN='FAIL|timeout' FILTER_CONTEXT=10 FILTER_TAIL=20 go test ./...
```

You can keep persistent defaults in `~/.claude/test-filter.conf` or `~/.codex/test-filter.conf`. These files are shell files, and the filter sources them. Use only configuration that you trust. You can also change these files in the [web console](/docs/console/).

## Find the right guide

- [Installation](/docs/installation/): prerequisites, the 3 hosts, hook trust, optional features, and sample denials.
- [Web console](/docs/console/): `concise-web` for settings, a hook playground, live activity, and pattern packs.
- [Configuration](/docs/configuration/): all defaults, the 5 layers, merge rules, confirmation modes, ignore paths, and log settings.
- [Categories](/docs/categories/): all 47 category ids, their presets and scopes, and example fixes.
- [Environment variables](/docs/environment/): all `BEC_` variables, with examples for cloud agents, overrides, and log settings.
- [Pattern packs](/docs/packs/): the JSON and script formats, the load order, custom detectors, validation, and how to generate references.
- [Settings tools](/docs/tools/): the `concise-config` CLI, the MCP server tools, and the tuner that adjusts settings to samples of your text.
- [Host features](/docs/host-features/): the Claude Code, Codex, and omp features that Concise uses, with the date of each source.
- [Pattern library](/docs/patterns/): the flagged words and the suggested fix for each built-in pattern, with 1 page for each category.

The reference pages use the Markdown source files of the plugin.

## Exceptions and limits

To stop the checks for one comment, one GitHub body, or one line of prose, use `concise-ignore`. To stop the checks for a whole file, put `concise-ignore-file` near the top of the file. Concise does not apply any check to paths in `ignoreGlobs`. Concise does not apply the style checks to paths in `styleIgnoreGlobs`. `allowList` removes single findings, and `bypass` removes a whole tool call from the checks. `softFail` changes denials into flagged allows.

For the exact behavior of these settings, refer to the [configuration reference](/docs/configuration/).

Concise is a heuristic check. It is not a parser, and it is not a security boundary. It has these limits:

- Pattern matches and the detection of comment tokens can cause false positives. Adjust the categories and the allow lists for your project.
- Concise does not do a check of `gh --body-file` bodies or of `git commit -F` or `--file` inputs. If you want these checks, use inline bodies and supported message forms.
- The test suite covers the hook contracts of Claude Code and Codex. It uses a stand-in to drive the omp extension. Live agent sessions are not part of the suite.
- Codex does not support `ask` decisions. Thus, Concise denies those calls and gives instructions to change the text or to get approval. If a user interface (UI) is attached, omp opens its confirmation dialog.
- omp has no subagent stop event. Thus, Concise does not do a check of omp subagent replies.
- Script packs run with your permissions in the hook process. Before you load a script pack, review its top-level code and its `detect` function.
- Concise activates packs by category. If you select a pack id or tag, Concise can activate the whole category. If a custom pack uses a built-in category, the custom pack activates with that category.
- `excludePacks` does not disable the em-dash pack. To disable the em-dash pack, turn off `features.emDash.enabled`.

The [plugin README](https://github.com/yannelli/be-concise/blob/main/plugins/concise/README.md#known-gaps) gives more gaps for specific detectors. If Concise does something that you do not expect, report it in [GitHub issues](https://github.com/yannelli/be-concise/issues).
