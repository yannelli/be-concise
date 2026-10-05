# Host features

Created: 2026-10-05
Last updated: 2026-10-05

The Claude Code and Codex features the concise manifests use, as the host docs described them on 2026-10-05. Read the sources again before you change a manifest.

## Used by the manifests

| Feature | Claude Code | Codex | Where |
|---|---|---|---|
| `statusMessage` on a command handler | yes | yes | Every handler in `hooks/hooks.json` and `hooks/codex.json` |
| `SessionStart` matcher `fork` | yes | no: `startup`, `resume`, `clear`, `compact` | `hooks/hooks.json` |
| `if` on a handler | yes | no | `hooks/hooks.json` shell hooks only |
| `SubagentHandback` tool carries the subagent report in `tool_input.message` (auto mode, v2.1.271 or later) | yes | no | `hooks/hooks.json` `PreToolUse` |
| `SubagentStop` fires for internal agents, with an empty `agent_type` when the session has no `--agent` | yes | no | `check-reply.mjs` skips them |
| Plugin MCP server file with `${CLAUDE_PLUGIN_ROOT}` in `args` | yes | no: see below | `.mcp.json` (Claude Code), `.codex-mcp.json` (Codex) |
| `${CLAUDE_PLUGIN_ROOT}` in plugin skill text | yes | not documented | `skills/*/SKILL.md`, with a relative path for Codex |
| `interface.composerIcon` and `interface.logo` | n/a | yes | `.codex-plugin/plugin.json` |

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

## Left out

- Plugin `bin/` on `PATH` (Claude Code): claude.ai and Cowork refuse a plugin with a `bin/` directory.
- `userConfig` prompts at install time (Claude Code): deferred.
- `PostToolBatch`, `additionalContext` on `Stop`, and exec-form `args` (Claude Code): no current use.

## Sources

- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code plugins reference: https://code.claude.com/docs/en/plugins-reference
- Codex hooks: https://learn.chatgpt.com/docs/hooks
- Codex plugins: https://developers.openai.com/plugins/build/plugins
- Codex MCP: https://developers.openai.com/codex/mcp
