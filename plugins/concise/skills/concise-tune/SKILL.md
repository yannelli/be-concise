---
name: concise-tune
description: Tune the concise plugin settings to match samples of the user's own writing. Use when the user shares writing samples, asks concise to match their style, or says concise flags text they write on purpose.
---

# Tune concise from writing samples

The tuner scans the user's samples with every pattern pack and the dash check, then proposes the smallest settings change that lets their own writing pass. Each change comes with the evidence that caused it. Nothing is written until the user agrees.

## Run the CLI

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" tune <path>... --kind <kind>
```

In Codex, the script is `../../scripts/concise-config.mjs` relative to this file. When the `concise` MCP server is connected, `concise_tune` takes the same input, with `texts` for samples the user pastes. In Codex, pass the project directory as `cwd`.

## Steps

### 1. Collect samples

Ask for text the user wrote themselves. Text an agent wrote teaches the tuner the patterns concise exists to catch. Aim for at least 1,000 words, spread over several files: a pattern that fires in 2 or more samples counts as part of the user's style.

Pick `--kind` from what the samples are:

| Kind | Samples | Checked as |
|---|---|---|
| `docs` (default) | Markdown and text files. A directory keeps prose files only. | Prose files |
| `reply` | Chat messages the user wrote. | Agent replies |
| `commit` | Commit messages, one per file. | `git commit` messages |
| `gh` | PR or issue bodies, one per file. | `gh` bodies; also sets the paragraph and sentence limits |
| `comments` | Source files. A directory keeps code files only. | Code comments; also sets `maxCommentLines` |

To collect commit messages or PR bodies, write one file per item:

```sh
mkdir -p /tmp/concise-commits
git log --author="$(git config user.email)" --no-merges -n 50 --format=%H | while read -r sha; do git log -1 --format=%B "$sha" > "/tmp/concise-commits/$sha.txt"; done
mkdir -p /tmp/concise-prs
gh pr list --author @me --state all --limit 30 --json number,body | node -e 'const fs = require("fs"); for (const pr of JSON.parse(fs.readFileSync(0, "utf8"))) fs.writeFileSync(`/tmp/concise-prs/${pr.number}.md`, pr.body || "")'
```

Show the user the sample list and the word count before you go on.

### 2. Preview

Run `tune` without `--apply`. Add `--preset <name>` when the user wants to start from a preset other than the one in effect. The output has four parts:

- One line per proposed change: the key, the value, and the reason, with up to 3 quoted examples from the samples.
- `kept`: categories that fired once and stay on, since one hit is not a habit.
- Packs that need more words before they can be tuned. Ask for more samples when one of these matters to the user.
- The diff of the config file that `--apply` writes.

### 3. Present the evidence

Walk the user through each change in plain words: what concise flagged, where it fired in their samples, and what the change does. Point out any change that turns a check off, since it also stops the check for agent text. The user can drop a change: apply the rest with `concise-config` edits instead of `tune --apply`.

### 4. Suggest dictionary entries

The tuner learns what the user writes. It cannot learn what the user avoids. Ask whether there are terms they never want to see, such as retired product names, banned words, or phrases from a style guide. For each one, propose a dictionary entry and test it over the samples:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" dict test --file /tmp/concise-prs/12.md --value blacklist --match startsWith --scope gh
```

An entry that matches the user's own samples flags their normal writing. Narrow it, or drop it. Add the rest with `dict add` after the user agrees; the `concise-config` skill covers the entry fields.

### 5. Apply

After the user agrees, run the same `tune` command with `--apply`. It writes to the project layer by default. Add `--layer user` when the user wants the settings in every project.

### 6. Confirm

Run `validate`, then `check` over one of the samples with the matching scope. A clean result shows the samples now pass:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/concise-config.mjs" check --scope files --path notes.md --file notes.md
```

## Rules

- Use only the user's own writing as samples.
- Write only after the user agrees to the diff.
- A later run with new samples adds to the lists it changed: a disabled category stays disabled, and an allowed phrase stays allowed. Use `concise-config` to undo a change.
