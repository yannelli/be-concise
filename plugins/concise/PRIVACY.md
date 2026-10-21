# Concise privacy policy

Effective: 2026-10-21

This policy covers the concise plugin for Claude Code, Codex, and omp, and the optional `concise-web` console from the `@yannelli/be-concise` npm package. Concise runs on your computer. It collects no telemetry and no analytics, it has no account, and the author receives no data from it.

## What concise reads

- The text of each call that a hook checks: file writes and edits, shell commands, MCP tool input, plans, tasks, questions, and the agent's last reply.
- `concise.json` config files in your project and in `~/.config/concise/`, `~/.claude/`, or `~/.codex/`.
- Pattern packs in `.claude/concise/patterns/`, `.codex/concise/patterns/`, and `~/.config/concise/patterns/`.

## What concise stores on your computer

| Location | Contents | How long |
|---|---|---|
| `~/.config/concise/projects/` | One entry for each project: its path, its name, its git repository name, and when concise first and last saw it | Until you delete it |
| `~/.local/state/concise/projects/<hash>/records.jsonl` | Each hook call with its full request and response | Rotates at 5 MiB and keeps 5 files |
| `~/.cache/concise/concise.log` | One line or record for each hook call | Only when you turn logging on |
| `~/.cache/concise/monitor/` | The address and access token of a running `concise-web` console | Removed when the console stops |
| The system temp folder | Session state, and the full output of filtered test runs | Session state is removed when the session ends. Test output stays until the system clears its temp folder |

The record file can hold any text that the agent wrote or read, including personal data or secrets that were in that text. Keep it private. To stop it, set `"monitor": { "persist": false }` in `concise.json` or `BEC_MONITOR_PERSIST=0`. `BEC_MONITOR_DISABLED=1` also stops the project entries. To delete stored data, delete the folders in the table.

## What concise sends

The hooks and the MCP server make no network calls, except one: when the `concise-web` console runs, each hook posts its record to the console on `127.0.0.1`. That post does not leave your computer.

The `concise-web` console runs only when you start it. It makes these network calls:

- It fetches the pack URLs that you enter.
- When you select **Check for updates**, it reads release data from `api.github.com`.
- Its `update` command runs `npm` and the `plugin` commands of your agent CLI, which contact their own registries.

## Your agent and model provider

Concise runs inside an agent host, such as Claude Code, Codex, or omp, and that host sends your conversation to a model provider. When a hook flags text, its message, with the flagged phrase and its location, becomes part of that conversation.

The host and the provider can collect telemetry, logs, and conversation data, including tool inputs, tool outputs, and the messages that concise hooks return. Concise has no control over that collection. Their own privacy policies and terms apply.

## Children

Concise is a developer tool. It is not directed at children under 18.

## Changes

Changes to this policy appear in this file with a new effective date. The git history of this file keeps every earlier version.

## Contact

Open an issue at https://github.com/yannelli/be-concise/issues or email ryanyannelli@gmail.com.
