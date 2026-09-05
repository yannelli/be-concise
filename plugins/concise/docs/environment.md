# Environment variables

Every variable uses the `BEC_` prefix. Set them on the process that starts Claude Code or Codex.

Value formats:

- Booleans read `1`, `true`, `yes`, and `on` as true, and `0`, `false`, `no`, `off`, and the empty string as false, case-insensitive. A value outside those two sets leaves the key alone.
- Id lists are comma-separated and trimmed.
- Path lists split on the platform path delimiter (`:` on Linux and macOS, `;` on Windows).
- A `BEC_ALLOW_*` or `BEC_BYPASS_*` value that starts with `[` is parsed as a JSON array, and any other value as a comma list.

The layer column refers to the 5 config layers in [configuration.md](configuration.md). Layer 2 sits under the user file and the project file. Layer 5 sits over both.

| Variable | Value | Effect | Layer |
| --- | --- | --- | --- |
| `BEC_CONFIG_JSON` | JSON object | a whole config layer | 2 |
| `BEC_CONFIG_PATH` | path | the project config file to read | 4 |
| `BEC_FEATURE_ENABLE` | id list | turns features and checks on | 2 |
| `BEC_FEATURE_DISABLE` | id list | turns features and checks off | 2 |
| `BEC_FEATURE_ALWAYS_ENABLE` | id list | turns features and checks on over the config files | 5 |
| `BEC_FEATURE_ALWAYS_DISABLE` | id list | turns features and checks off over the config files | 5 |
| `BEC_ENABLE_PATTERNS` | id list | adds to `features.aiWriting.enablePatterns` | 2 |
| `BEC_DISABLE_PATTERNS` | id list | adds to `features.aiWriting.disablePatterns` | 2 |
| `BEC_ALWAYS_ENABLE_PATTERNS` | id list | the same key, over the config files | 5 |
| `BEC_ALWAYS_DISABLE_PATTERNS` | id list | the same key, over the config files | 5 |
| `BEC_LOAD_LIB_PATHS` | path list | appended to `features.aiWriting.packs` | 2 |
| `BEC_HOOK_SOFT_FAIL` | boolean | `softFail` | 5 |
| `BEC_DISABLE_STOP_HOOK` | boolean | `stopHook`, inverted | 5 |
| `BEC_LOG_ENABLED` | boolean | `log.enabled` | 5 |
| `BEC_LOG_PATH` | path | `log.path` | 5 |
| `BEC_LOG_MAX_SIZE` | bytes, or a `k`, `m`, `g` suffix | `log.maxSize` | 5 |
| `BEC_LOG_MAX_FILES` | positive integer | `log.maxFiles` | 5 |
| `BEC_LOG_ROTATE` | `size`, `daily`, or `both` | `log.rotate` | 5 |
| `BEC_LOG_USE_JSON` | boolean | `log.format` as `json` | 5 |
| `BEC_LOG_USE_PLAINTEXT` | boolean | `log.format` as `plaintext`, which wins over `BEC_LOG_USE_JSON` | 5 |
| `BEC_MONITOR_PERSIST` | boolean | `monitor.persist` | 5 |
| `BEC_MONITOR_DISABLED` | `1` | skips the project registry, the record file, and the console feed | none |
| `BEC_ALLOW_PHRASES` | phrase list | `allowList.phrases` | 5 |
| `BEC_ALLOW_PATTERNS` | regex list | `allowList.patterns` | 5 |
| `BEC_BYPASS_PHRASES` | phrase list | `bypass.phrases` | 5 |
| `BEC_BYPASS_PATTERNS` | regex list | `bypass.patterns` | 5 |

Feature ids for `BEC_FEATURE_*`: `emDash`, `aiWriting`, `comments`, `fileSize`, `prBody`, and `stopHook`.

Pattern ids for `BEC_*_PATTERNS`: a category id, a pack id, or `tag:<tag>`. An unknown id is ignored. The category ids are listed in [categories.md](categories.md).

## Scenario 1: a cloud agent with no config file

A cloud agent checks the repo out fresh and writes no config file. Set the whole configuration in the environment.

```sh
export BEC_FEATURE_ENABLE=emDash,aiWriting
export BEC_ENABLE_PATTERNS=file-narration,benefit-tail
export BEC_HOOK_SOFT_FAIL=1
export BEC_LOG_ENABLED=1
```

After those 4 lines, the dash check and the AI writing check run under the `default` preset, `file-narration` and `benefit-tail` run on top of it, every deny comes back as an allow prefixed `[concise] soft-fail:`, and one record per hook call lands in `~/.cache/concise/concise.log`.

Set `preset` from the environment with `BEC_CONFIG_JSON`:

```sh
export BEC_CONFIG_JSON='{"features":{"aiWriting":{"enabled":true,"preset":"technical"}}}'
```

## Scenario 2: force one category off over the project file

The project file sets `"preset": "ryan"`, which turns on `formatting`. A repo that prefixes commit subjects with a gitmoji trips it on every commit. Turn that one category off for your sessions.

```sh
BEC_ALWAYS_DISABLE_PATTERNS=formatting claude
```

`BEC_DISABLE_PATTERNS` sits at layer 2, under the project file, so a project file that lists `formatting` in `categories` would win. `BEC_ALWAYS_DISABLE_PATTERNS` sits at layer 5, over the project file, and takes the category off in both cases.

The feature form works the same way. `BEC_FEATURE_ALWAYS_DISABLE=aiWriting` turns the whole AI writing check off over a project file that enables it.

## Scenario 3: turn logging on for one session

```sh
BEC_LOG_ENABLED=1 BEC_LOG_PATH=/tmp/concise.log BEC_LOG_USE_PLAINTEXT=1 claude
```

Each hook call appends one line of `ts hook tool decision key summary` to `/tmp/concise.log`, with `-` for an empty cell. Read the denials with:

```sh
grep ' deny ' /tmp/concise.log
```

To keep the default JSON records and rotate them daily instead:

```sh
BEC_LOG_ENABLED=1 BEC_LOG_ROTATE=daily BEC_LOG_MAX_FILES=7 claude
```

That writes `~/.cache/concise/concise.YYYY-MM-DD.log` and keeps 7 of them.
