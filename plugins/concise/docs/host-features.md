# Host features

Created: 2026-10-05
Last updated: 2026-10-08

The Claude Code and Codex features the concise manifests use, as the host docs described them on 2026-10-05 (2026-10-08 for the `NotebookEdit`, `PowerShell`, MCP, task, question, and `PostToolUse` rows), and the omp features the omp extension uses, as of 2026-10-07. Read the sources again before you change a manifest or `omp/extension.mjs`.

## Used by the manifests

| Feature | Claude Code | Codex | Where |
|---|---|---|---|
| `statusMessage` on a command handler | yes | yes | Every handler in `hooks/hooks.json` and `hooks/codex.json` |
| `SessionStart` matcher `fork` | yes | no: `startup`, `resume`, `clear`, `compact` | `hooks/hooks.json` |
| `if` on a handler | yes | no | `hooks/hooks.json` shell hooks only |
| `if` with a permission rule per handler, such as `Bash(cat *)`, matched against each subcommand | yes | no | `hooks/hooks.json`: the heredoc-write handlers of `check-edit`, the `jj` handlers of `check-bash`, and the `PowerShell` handlers |
| `NotebookEdit` input: `notebook_path`, `cell_id`, `new_source`, `cell_type`, `edit_mode` | yes | no | `hooks/hooks.json` `PreToolUse`, read by `check-edit.mjs` |
| `PowerShell` tool with `tool_input.command` | yes | no | `hooks/hooks.json` `PreToolUse`, read by `check-bash.mjs` |
| A matcher with characters outside letters, digits, `_`, `-`, `\|`, and `,` is a regex, so `mcp__.*` matches every `mcp__<server>__<tool>` call | yes | yes: every matcher is a regex, and `PreToolUse` fires for MCP tools | `PreToolUse` in both manifests, read by `check-tool-text.mjs` |
| `PreToolUse` on `ExitPlanMode` (`plan`, which Claude Code fills from the plan file), on `TaskCreate` and `TaskUpdate` (`subject`, `description`, `activeForm`) and on `AskUserQuestion` (`questions[].question`, `options[].label`, `options[].description`) | yes | no | `hooks/hooks.json`, read by `check-tool-text.mjs` |
| `PostToolUse` input with `duration_ms`, and `decision: "block"`, which adds the reason next to the tool result | yes | not used | `hooks/hooks.json` `PostToolUse` on `Bash\|PowerShell`, read by `check-shell-writes.mjs` |
| `SubagentHandback` tool carries the subagent report in `tool_input.message` (auto mode, v2.1.271 or later) | yes | no | `hooks/hooks.json` `PreToolUse` |
| `SubagentStop` fires for internal agents, with an empty `agent_type` when the session has no `--agent` | yes | no | `check-reply.mjs` skips them |
| Plugin MCP server file with `${CLAUDE_PLUGIN_ROOT}` in `args` | yes | no: see below | `.mcp.json` (Claude Code), `.codex-mcp.json` (Codex) |
| `${CLAUDE_PLUGIN_ROOT}` in plugin skill text | yes | not documented | `skills/*/SKILL.md`, with a relative path for Codex |
| `interface.composerIcon` and `interface.logo` | n/a | yes | `.codex-plugin/plugin.json` |

The hooks docs say a handler defined in more than one settings file runs once. They do not say whether two handlers in one plugin with the same command and different `if` rules both run for one call. When their rules can overlap, `check-edit` and `check-bash` claim the call's `tool_use_id`, so a second run exits without output.

## Codex MCP server

The Codex plugin docs describe bundled MCP servers and plugin-scoped policy under `plugins.<plugin>.mcp_servers.<server>`, with a remote HTTP server as the example. They do not cover local stdio paths. A live run with codex-cli 0.159.0 on 2026-10-05, with the plugin installed from this repository into a temporary `CODEX_HOME`, showed:

- `${CLAUDE_PLUGIN_ROOT}` and `${PLUGIN_ROOT}` stay literal in MCP `args`, so the server does not start.
- `"cwd": "."` resolves to the plugin root. With `"args": ["./tools/mcp-server.mjs"]`, all 8 tools load.
- The server gets no project directory: no environment variable, no MCP roots, and no cwd in the call `_meta`. Its working directory is the plugin root.

So the Codex manifest points `mcpServers` at `.codex-mcp.json`, which uses the relative path and `cwd`. In Codex, each project tool needs the `cwd` argument. Without it, the server refuses the call, since a project edit would land in the plugin cache.

The `concise-config` and `concise-tune` skills call the CLI, so they work without the server. To register the server by hand instead:

```sh
codex mcp add concise -- node /path/to/plugins/concise/tools/mcp-server.mjs
```

## omp

omp (oh-my-pi) installs the plugin from the Claude Code marketplace catalog, `.claude-plugin/marketplace.json`. It does not run `hooks/hooks.json`. It loads JavaScript extensions instead, so `package.json` in the plugin root lists `omp/extension.mjs` under `omp.extensions`. A marketplace install links the cached plugin into omp's `plugins/node_modules` and loads that entry. The extension builds the hook input that Claude Code would send and runs the same hook scripts with `node`.

| omp feature | Used for |
|---|---|
| `tool_call` with `{ block, reason }` | Denials from `check-edit`, `check-bash`, and the `ask` mode |
| `tool_call` returning `input` | The test-output filter's command rewrite |
| `tool_call` returning `additionalContext` | Flags and notices for the model |
| `before_agent_start` returning `message` | The rules from `session-context`, as `SessionStart`, `SubagentStart`, or `UserPromptSubmit` |
| `session_stop` with `{ decision: "block", reason }` | Reply checks. The event carries `last_assistant_message`, `session_id`, and `stop_hook_active` |
| `session_shutdown` | `session-end`, with a 1.5 s limit inside omp's 2 s budget |
| `ctx.ui.confirm` and `ctx.ui.notify` | `ask` prompts and terminal notices when a UI is attached |

Tool names and inputs differ from Claude Code. `write` sends `{ path, content }`. `edit` input depends on the edit mode: `hashline` (the default) sends `[path#TAG]` sections with `+` body rows, `apply_patch` sends a Codex patch, `replace` sends `old_string` and `new_string`, `patch` sends `edits[].diff`, and `sloppy` sends `*** Edit File:` sections. `omp/translate.mjs` turns each mode into the added lines that `check-edit` reads.

A live run with omp 18.7.0 on 2026-10-07 confirmed these shapes. In that run, a hashline edit and a write were denied, the test filter's rewritten command ran in omp's shell, the rules reached the model, and a reply with an em dash was held and rewritten.

omp's Claude marketplace loader, `src/discovery/claude-plugins.ts`, substitutes `${CLAUDE_PLUGIN_ROOT}` in MCP `args` and loads `skills/`. The omp docs do not mention `CLAUDE_PROJECT_DIR`, so pass `cwd` to the project tools as in Codex.

Gaps: omp has no subagent stop event, so subagent replies are not checked. The extension does not check MCP tool calls, and it does not scan files that a shell command changes. omp blocks a tool call whose handler throws or runs past 30 s, so the extension catches every hook failure and allows the call. omp loads extensions at session start: start a new session after an install or update.

## Left out

- Plugin `bin/` on `PATH` (Claude Code): claude.ai and Cowork refuse a plugin with a `bin/` directory.
- `userConfig` prompts at install time (Claude Code): deferred.
- `PostToolBatch`, `additionalContext` on `Stop`, and exec-form `args` (Claude Code): no current use.
- `MessageDisplay` (Claude Code): it only changes what the terminal shows. It cannot block a message or send text to Claude, so text between tool calls stays unchecked.
- `TaskCreated` (Claude Code): the `PreToolUse` hook on `TaskCreate` reads the same subject and description.

## Sources

- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code plugins reference: https://code.claude.com/docs/en/plugins-reference
- Codex hooks: https://learn.chatgpt.com/docs/hooks
- Codex plugins: https://developers.openai.com/plugins/build/plugins
- Codex MCP: https://developers.openai.com/codex/mcp
- omp extensions: https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md
- omp marketplace: https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md
- omp plugin install plumbing: https://github.com/can1357/oh-my-pi/blob/main/docs/plugin-manager-installer-plumbing.md
- omp edit modes: https://github.com/can1357/oh-my-pi/blob/main/docs/tools/edit.md
- omp Claude marketplace loader: https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/discovery/claude-plugins.ts
