---
name: concise-config
description: Read and change the concise plugin settings, and manage its dictionary of flagged terms. Use when the user asks to change a concise limit, mode, preset, or allow list, to flag or stop flagging a word or phrase, or to find out why a "[concise]" message fired.
---

# Configure concise

Change settings with the `concise-config` CLI or the `concise_*` MCP tools. Both validate the result and show a diff before they write. Do not edit `concise.json` by hand.

## Run the CLI

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" <command> [options]
```

In Codex, the script is `../../scripts/concise-config.mjs` relative to this file. Add `--cwd <project>` when the shell is not in the project. Add `--json` to get the raw result.

When the `concise` MCP server is connected, the same operations are tools: `concise_settings_show`, `concise_settings_keys`, `concise_settings_get`, `concise_settings_edit`, `concise_settings_validate`, `concise_dictionary`, and `concise_check_text`. In Codex, pass the project directory as `cwd` to each tool.

## Steps

1. Read the current state: `show` lists the config files, which ones are in effect, `BEC_` overrides, and load problems. `get <key>` shows the default, the effective value, and the value in each file.
2. Find the key: `keys <word>` searches the documented keys. Explain the key and its current value to the user in one or two sentences.
3. Preview the change: run the edit without `--apply`. Show the user the diff and the file path.
4. Write it after the user agrees: run the same command again with `--apply`.
5. Check the result: `validate`, then `get <key>` to confirm the effective value.

A `BEC_` environment variable or a project file can override the file you edit. When `get` shows a different effective value after the write, name the layer or variable that wins.

## Edit commands

| Command | Result |
|---|---|
| `set <key> <value>` | Sets a key. The value is JSON, or a plain string. |
| `unset <key>` | Removes a key and any parent object left empty. |
| `add <key> <value>` | Adds items to a list key, such as `allowList.phrases`. Skips items already in the list. |
| `remove <key> <value>` | Removes items from a list key. |

`--layer project` (default) writes the project file in effect, else `.claude/concise.json` (or `.codex/concise.json` when only `.codex/` exists). `--layer user` writes the user file. `show` lists the other layer ids.

Examples:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" set features.aiWriting.preset ryan
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" add features.aiWriting.disablePatterns '["hedging"]' --apply
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" set maxCommentLines 4 --layer user --apply
```

## Dictionary

`features.dictionary` flags terms the user names, in the same hooks and with the same confirm flow as the other style checks. Use it for a word, phrase, or pattern that no preset covers.

| Field | Values |
|---|---|
| `id` | Lowercase letters, digits, and hyphens. Generated from `value` when omitted. |
| `match` | `exact` (default), `contains`, `startsWith`, `endsWith`, or `regex`. |
| `value` | The term, the phrase, or the regular expression. |
| `fix` | What to write instead. The hook message shows it. |
| `on` | `word` (default), `line`, or `text`. `regex` ignores it. |
| `caseSensitive` | `false` by default. |
| `flags` | Regex flags for `regex` entries. Default `i`. |
| `hooks` | `edit`, `bash`, `stop`, `subagentStop`. Omit for all. |
| `scopes` | `files`, `comments`, `code`, `gh`, `commit`, `command`, `reply`. Omit for every scope except `command` and `code`. |

Pick `match` and `on` from what the user wants to catch:

- One word in any form, such as "blacklist" and "blacklisted": `startsWith` on `word`.
- A word only when it stands alone: `exact` on `word`. `C++` and `#tag` match as whole words.
- A sign-off at the end of a line: `endsWith` on `line`.
- A ticket key or other shape: `regex`. Put the part to report in a `(?<hit>...)` group.

Test an entry before you add it. `dict test` runs it over sample text without saving anything:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" dict test "Blacklisted hosts." --value blacklist --match startsWith
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" dict add --value blacklist --match startsWith --fix "denylist" --apply
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" dict add --value "Hope this helps!" --match endsWith --on line --fix "end on the last fact" --hooks stop,subagentStop --apply
```

- `dict list` shows each entry and the file that sets it.
- `dict remove <id>` deletes an entry from the chosen file. When another file sets the entry, `dict remove <id> --disable` switches it off from the chosen file.
- `dict add --replace` overwrites an entry with the same id.

Entries merge by `id` across files: a project entry replaces a user entry with the same id. The `[concise:dictionary:<id>]` tag in a hook message names the entry that fired.

## Check text

`check` runs the checks over text the way a hook would, and changes no retry or confirmation state. Use it to explain a `[concise]` message or to try a setting:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" check --scope commit "WIP parser"
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" check --scope files --path docs/guide.md --file docs/guide.md
```

The exit status is 1 when `check` finds something or `validate` finds an invalid file, and 2 on an error.

## Rules

- Write with `--apply` only after the user agrees to the diff.
- Edit one layer per change. Default to the project layer. Use the user layer when the user asks for a setting in every project.
- To change settings from the user's own writing, use the `concise-tune` skill.
- The full key list is in [../../docs/configuration.md](../../docs/configuration.md). The CLI and MCP reference is in [../../docs/tools.md](../../docs/tools.md).
