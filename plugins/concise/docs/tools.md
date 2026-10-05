# Settings tools

Concise ships three ways for an agent or a person to read and change its settings: a CLI, an MCP server with the same operations, and two skills that drive them. Each edit is validated against the config schema and previewed as a diff. A write needs `--apply` (CLI) or `apply: true` (MCP).

## CLI

```sh
node plugins/concise/scripts/concise-config.mjs <command> [arguments] [options]
```

In an installed plugin, the script is `${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs`. It needs Node.js only.

| Command | Result |
|---|---|
| `show` | The effective settings and every config layer file, with `BEC_` overrides and load problems. |
| `keys [query]` | The documented keys, defaults, and descriptions from [configuration.md](configuration.md). |
| `get <key>` | One key: its default, the effective value, and the value in each layer file. |
| `set <key> <value>` | Sets a key. The value is JSON, or a plain string when it does not parse. |
| `unset <key>` | Removes a key and any parent object left empty. |
| `add <key> <value>` | Adds items to a list key. Items already in the list are skipped. |
| `remove <key> <value>` | Removes items from a list key. |
| `validate` | Validates every layer file and reports load problems. |
| `check [text]` | Runs the checks over text from the argument, `--file`, or stdin. Retry and confirmation state stay unchanged. |
| `dict list` | Dictionary entries and the layer that sets each one. |
| `dict add` | Adds an entry from `--value`, `--fix`, `--match`, `--on`, `--id`, `--hooks`, `--scopes`, `--flags`, and `--case-sensitive`. |
| `dict remove <id>` | Removes an entry from a layer. `--disable` switches off an entry that another layer sets. |
| `dict test [text]` | Runs an entry built from the flags over text without saving it. |
| `tune <path>...` | Proposes settings that fit writing samples. See [Tuner](#tuner). |

| Option | Meaning |
|---|---|
| `--cwd <dir>` | Project directory. Default: the current directory. |
| `--layer <name>` | `project` (default), `user`, or a layer id from `show`. |
| `--apply` | Writes the change. Without it, edit commands print the diff only. |
| `--json` | Prints the raw result. |
| `--scope`, `--hook`, `--path` | The text scope, the hook to imitate, and the file path for `check` and `dict test`. |
| `--kind`, `--preset` | The sample kind and the base preset for `tune`. |

`--layer project` writes the project file in effect. When no project file exists, it writes `.claude/concise.json`, or `.codex/concise.json` when only `.codex/` exists. `--layer user` writes the user file in effect, else `$XDG_CONFIG_HOME/concise/concise.json` or `~/.config/concise/concise.json`.

A write compares the file with the version the preview read. When the file changed in between, the write stops with `Configuration changed on disk`.

Exit status: 0 on success, 1 when `check` finds something or `validate` finds an invalid file, 2 on an error. Errors go to stderr as `concise-config: <reason>`.

## MCP server

`tools/mcp-server.mjs` is a stdio MCP server with no dependencies. It writes JSON-RPC to stdout and logs to stderr.

| Tool | Writes | Operation |
|---|---|---|
| `concise_settings_show` | no | `show` |
| `concise_settings_keys` | no | `keys` |
| `concise_settings_get` | no | `get` |
| `concise_settings_edit` | with `apply` | `set`, `unset`, `add`, `remove` through `op` |
| `concise_settings_validate` | no | `validate` |
| `concise_dictionary` | with `apply` | `dict list`, `add`, `remove`, `test` through `action` |
| `concise_check_text` | no | `check` |
| `concise_tune` | with `apply` | `tune`, with `paths` and `texts` |

The project directory is the `cwd` argument, else `CLAUDE_PROJECT_DIR`, else the server's working directory. When the working directory is the plugin itself, every tool except `concise_settings_keys` and `concise_dictionary` with `action: "test"` refuses the call until `cwd` is passed.

- Claude Code starts the server from the plugin's `.mcp.json`.
- Codex starts it from `.codex-mcp.json`, in the plugin directory, so Codex calls pass `cwd`. [host-features.md](host-features.md) has the details. To register the server by hand:

```sh
codex mcp add concise -- node /path/to/plugins/concise/tools/mcp-server.mjs
claude mcp add concise -- node /path/to/plugins/concise/tools/mcp-server.mjs
```

## Skills

- `concise-config`: reads the settings, explains a key, previews a change, and writes it after the user agrees. Also covers dictionary entries and `check`.
- `concise-tune`: collects the user's writing samples, runs the tuner, presents the evidence, suggests dictionary entries, and applies the result after the user agrees.
- `concise-rules`: the reference for the checks, the escape hatches, and the confirm flow.

The skills call the CLI, so they work when the MCP server is not connected.

## Tuner

`tune` scans the samples with every pack (preset `all`) and the dash check, with the dictionary off. It proposes changes only for categories in the target preset: `--preset`, else the preset in effect. Hits that the allow lists already cover do not count.

| Kind | Samples | Scanned as |
|---|---|---|
| `docs` (default) | Prose files. A directory keeps prose files only. | Prose files |
| `reply` | Chat messages. | Replies |
| `commit` | Commit messages, one per file. | Commit messages |
| `gh` | PR or issue bodies, one per file. | `gh` bodies |
| `comments` | Source files. A directory keeps code files only. | Code comments |

| Signal in the samples | Change |
|---|---|
| A category fires in 2 or more samples, or at least once per 500 words | Adds the category to `features.aiWriting.disablePatterns` |
| A phrase category fires 2 or more times, always on the same phrase | Adds the phrase to `features.aiWriting.allow` |
| A statistical pack with a tunable threshold fires | Sets the threshold in `features.aiWriting.options` to the nearest value that every sample passes |
| A statistical pack has fewer words than its `minWords` | Lists the pack as needing more words |
| A category fires once in one sample | Leaves it on and lists it under `kept` |
| `aiWriting` is off and the samples have 300 words or more | Turns `aiWriting` on |
| Em dashes, while the dash check is on | Turns the dash check off |
| En dashes only, while the dash check is on | Sets `features.emDash.enDash` to `false` |
| No dashes in 1,000 words or more, while the dash check is off | Turns the dash check on |
| Kind `gh` | Raises `maxPrBodyParagraphs` and `maxPrBodySentences` to the 90th percentile of the samples |
| Kind `comments` | Raises `maxCommentLines` to the 90th percentile of the comment runs |

Each change comes with its reason and up to 3 quoted examples from the samples. `--apply` merges the change into the chosen layer: objects merge, lists gain the new items, and other values are replaced.
