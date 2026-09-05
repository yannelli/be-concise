# Configuration

Copy `.claude/concise.json.example` to `.claude/concise.json` (Claude Code) or `.codex/concise.json` (Codex) in your project, then edit the keys below. If both files exist, `.claude/concise.json` wins.

## Every key and its default

| Key | Default | What it does |
|---|---|---|
| `maxCommentLines` | `2` | Line limit for one contiguous comment run. |
| `maxFileLines` | `300` | Line limit for a new file. |
| `maxPrBodyParagraphs` | `1` | Prose paragraph limit for a `gh` body. |
| `maxPrBodySentences` | `3` | Sentence limit for one paragraph of a `gh` body. |
| `maxRetries` | `2` | Denials on one target before the hook allows and flags it. |
| `ignoreGlobs` | 9 globs | Paths exempt from every check. |
| `checks.comments` | `true` | Runs the comment length check. |
| `checks.fileSize` | `true` | Runs the file length check. |
| `checks.prBody` | `true` | Runs the `gh` body check. |
| `stopHook` | `true` | Runs the `Stop` hook over the agent's reply. |
| `softFail` | `false` | Turns every deny, ask, and block into a flagged allow. |
| `styleIgnoreGlobs` | 28 globs | Paths exempt from the style checks only. |
| `allowList.phrases` | `[]` | Phrases that drop a finding on the line that holds them. |
| `allowList.patterns` | `[]` | Regex strings that drop a finding on the line they match. |
| `bypass.phrases` | `[]` | Phrases that exempt the whole tool call. |
| `bypass.patterns` | `[]` | Regex strings that exempt the whole tool call. |
| `log.enabled` | `false` | Writes one record per hook invocation. |
| `log.path` | `null` | Log file path. `null` uses `~/.cache/concise/concise.log`. |
| `log.maxSize` | `"5m"` | Size that triggers rotation. |
| `log.maxFiles` | `5` | Rotated files kept. |
| `log.rotate` | `"size"` | `size`, `daily`, or `both`. |
| `log.format` | `"json"` | `json` or `plaintext`. |
| `monitor.persist` | `true` | Appends each hook record, with its request and response, to the project's record file for `concise-web --all`. |
| `features.emDash.enabled` | `false` | Runs the dash check. |
| `features.emDash.enDash` | `true` | Flags the en dash (`U+2013`) as well. |
| `features.emDash.doubleHyphen` | `false` | Flags `--` between word characters or between spaces. |
| `features.emDash.mode` | `"confirm"` | `confirm`, `ask`, or `deny`. |
| `features.emDash.replies` | `true` | Scans the agent's final reply. |
| `features.aiWriting.enabled` | `false` | Runs the AI writing check. |
| `features.aiWriting.preset` | `"default"` | One of the 8 preset names. |
| `features.aiWriting.categories` | `null` | An explicit category list that replaces the preset's list. |
| `features.aiWriting.allow` | `[]` | Words or phrases that are never flagged. |
| `features.aiWriting.mode` | `"confirm"` | `confirm`, `ask`, or `deny`. |
| `features.aiWriting.replies` | `true` | Scans the agent's final reply. |
| `features.aiWriting.packs` | `[]` | Extra pack files or directories. |
| `features.aiWriting.excludePacks` | `[]` | Pack ids to drop. |
| `features.aiWriting.enablePatterns` | `[]` | Category ids, pack ids, or `tag:<tag>` to add. |
| `features.aiWriting.disablePatterns` | `[]` | Category ids, pack ids, or `tag:<tag>` to drop. |
| `features.aiWriting.options` | `{}` | Script pack thresholds, keyed by pack id. |

The default `ignoreGlobs` list: `**/node_modules/**`, `**/vendor/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/*.generated.*`, `**/*.min.js`, `**/package-lock.json`, `**/*.lock`.

## The five layers

The hook reads config from 5 layers, lowest first. A higher layer replaces a scalar key.

1. The built-in defaults.
2. `BEC_CONFIG_JSON`, then the baseline variables `BEC_FEATURE_ENABLE`, `BEC_FEATURE_DISABLE`, `BEC_ENABLE_PATTERNS`, `BEC_DISABLE_PATTERNS`, and `BEC_LOAD_LIB_PATHS`.
3. User config: the first of `$XDG_CONFIG_HOME/concise/concise.json`, `~/.config/concise/concise.json`, `~/.claude/concise.json`, `~/.codex/concise.json`.
4. Project config: `BEC_CONFIG_PATH` when it is set, else `<cwd>/.claude/concise.json`, else `<cwd>/.codex/concise.json`.
5. The override variables: the `ALWAYS` forms, `BEC_HOOK_SOFT_FAIL`, `BEC_DISABLE_STOP_HOOK`, the `BEC_LOG_*` set, the `BEC_ALLOW_*` set, and the `BEC_BYPASS_*` set.

A project file overrides `BEC_FEATURE_ENABLE`. `BEC_FEATURE_ALWAYS_ENABLE` overrides the project file. The variables are listed in [environment.md](environment.md).

## Merge rules per key

- Unioned across layers, duplicates dropped, order kept: `styleIgnoreGlobs`, `allowList.phrases`, `allowList.patterns`, `bypass.phrases`, `bypass.patterns`, `features.aiWriting.allow`, `features.aiWriting.packs`, `features.aiWriting.excludePacks`.
- Replaced by the higher layer: `ignoreGlobs`, `features.aiWriting.categories`.
- Merged one level deep: `features`, `checks`, `log`, and `features.aiWriting.options` per pack id.
- `enablePatterns` and `disablePatterns` end as two final lists. Inside one layer, an id in both goes to disable. A higher enable removes the id from a lower disable, and a higher disable removes it from a lower enable.

A config file or a `BEC_CONFIG_JSON` value that does not parse as a JSON object is skipped. The other layers still apply, and the hook reports the skipped layer once per session in a `systemMessage`.

## checks and stopHook

Each core check has its own switch under `checks`: `comments`, `fileSize`, and `prBody`, all `true` by default. Setting one to `false` skips that check and leaves the style checks running.

```json
{
  "checks": { "comments": true, "fileSize": false, "prBody": true },
  "stopHook": false
}
```

`"stopHook": false` makes the `Stop` hook write `{}` and exit before it reads the transcript.

## mode

`mode` is set per feature, under `features.emDash.mode` and `features.aiWriting.mode`. It takes `confirm`, `ask`, or `deny`. When both features fire on one call, the strictest mode wins (`deny` over `ask` over `confirm`) and one message carries both parts.

`confirm` is the default. The flow:

1. The first write carrying a finding is denied. The reason names the file, the line, the flagged text, the category, the fix, and a reference path.
2. To keep the text, send the identical write again. The hook allows it and reports `[concise] Kept after confirmation: <summary>` in a `systemMessage` and in `additionalContext`.
3. To fix the text, send different text. The hook checks the new text from the start.
4. A third identical write starts a new episode and is denied again.

`ask` returns `permissionDecision: "ask"` on `PreToolUse`, so you approve or reject the call yourself. On `Stop` it behaves as `confirm`.

`deny` denies until `maxRetries` is passed, then allows the write and flags it, the same as the 3 core checks.

## allowList and bypass

`allowList.phrases` and `allowList.patterns` drop single findings. A finding is dropped when its matched text or its whole source line contains a phrase (case-insensitive) or matches a pattern (a regex string, compiled with the `i` flag). Both lists cover em dashes and every AI writing category. A pattern that does not compile is skipped and reported once per session.

```json
{
  "allowList": { "phrases": ["load-bearing"], "patterns": ["^Fixes #\\d+"] }
}
```

That config keeps the word `load-bearing` and any line starting with `Fixes #` followed by digits.

`bypass.phrases` and `bypass.patterns` exempt the whole tool call. When the written chunks, the full `Bash` command, or the reply text holds a phrase or matches a pattern, the hook allows the call with the flag `[concise] Allowed by bypass phrase "<phrase>"` and runs no other check. `concise-ignore` and `concise-ignore-file` keep their narrower behavior.

```json
{
  "bypass": { "phrases": ["concise-bypass"], "patterns": ["^WIP:"] }
}
```

That config skips every check on a write that holds the text `concise-bypass`, and on a `git commit` whose message starts with `WIP:`.

## softFail

`"softFail": true`, or `BEC_HOOK_SOFT_FAIL=1`, turns every deny, every ask, and every `Stop` block into an allow that carries the same text, prefixed `[concise] soft-fail:`. On `PreToolUse` the text goes to `systemMessage` and to `additionalContext`; on `Stop` it goes to `systemMessage`. Retry counters and pending confirmation hashes are left as they are, so turning soft fail off resumes the normal flow mid-session.

## ignoreGlobs and styleIgnoreGlobs

`ignoreGlobs` exempts a path from every check. `styleIgnoreGlobs` exempts a path from the style checks, and the comment and file length checks still apply. The default `styleIgnoreGlobs` list covers agent instruction files:

`**/.claude/**`, `**/.codex/**`, `**/.agent/**`, `**/.agents/**`, `**/.cursor/**`, `**/.cursorrules`, `**/.windsurf/**`, `**/.windsurfrules`, `**/.gemini/**`, `**/.roo/**`, `**/.clinerules`, `**/.clinerules/**`, `**/.kiro/**`, `**/.continue/**`, `**/.aider*`, `**/.opencode/**`, `**/.amazonq/**`, `**/.junie/**`, `**/.trae/**`, `**/.augment/**`, `**/.github/copilot-instructions.md`, `**/.github/instructions/**`, `**/.github/prompts/**`, `**/.github/agents/**`, `**/CLAUDE.md`, `**/CLAUDE.local.md`, `**/AGENTS.md`, `**/GEMINI.md`.

A higher config layer adds to this list. A reply, a commit message, a `gh` body, and a command text are scanned under a virtual path, so neither list applies to them.

## log

`"log": { "enabled": true }`, or `BEC_LOG_ENABLED=1`, writes one record per hook invocation. The default path is `~/.cache/concise/concise.log`, with `os.tmpdir()/concise/concise.log` as the fallback when the home directory cannot be written. A `log.path` whose directory cannot be created turns logging off.

Fields per record: `ts`, `hook`, `event`, `tool`, `session`, `cwd`, `key`, `scope`, `decision` (`allow`, `flag`, `deny`, `ask`, `block`, `bypass`, or `error`), `mode`, `softFail`, `findings` (`category`, `match`, and `line`, capped at 20), `counts`, `durationMs`, and `error`. A field with no value is `null`.

One record from a denied em dash write:

```json
{"ts":"2026-09-04T04:03:23.197Z","hook":"check-edit","event":"PreToolUse","tool":"Write","session":"doc-6","cwd":"/tmp/demo","key":"style:/tmp/demo/notes.md","scope":"files","decision":"deny","mode":"confirm","softFail":false,"findings":[{"category":"emDash","match":"parser runs first — then it rejects th","line":1}],"counts":{"emDash":1,"aiWriting":0},"durationMs":12,"error":null}
```

Format `json` writes one JSON object per line. Format `plaintext` writes `ts hook tool decision key summary`, with `-` for an empty cell. Rotation `size` renames the file to `.1` through `.<maxFiles>` once it passes `maxSize` and drops the oldest. Rotation `daily` writes `concise.YYYY-MM-DD.log` beside the configured path and keeps `maxFiles` of them. Rotation `both` does both. A write failure is swallowed and the hook still answers.

## monitor

Every hook call registers its project in `~/.config/concise/projects/<folder>-<hash>.json` (`$XDG_CONFIG_HOME` when set) with the real path, the name, the first and last time seen, and the path of its record file. With `monitor.persist` on, the hook also appends the full record, including the tool request and the hook response, to `~/.local/state/concise/projects/<hash>/records.jsonl` (`$XDG_STATE_HOME` when set). The file rotates at 5 MiB and keeps 5 copies. `concise-web --all` reads the registry and follows every record file. `"monitor": { "persist": false }`, or `BEC_MONITOR_PERSIST=0`, keeps the registry entry and skips the record. `BEC_MONITOR_DISABLED=1` skips both and the console feed. Without a home directory the hook writes neither.
