# Claude directory branch

Created: 2026-10-21
Last updated: 2026-10-21

Anthropic's directory lists the concise plugin from the `claude-directory` branch of this repository. That branch holds only the Claude plugin, at its root. The release workflow generates it, so never edit it by hand.

## Why a separate tree

The directory validator holds a plugin for review when its folder is a subfolder of the repository and its hooks run files other than plain shell scripts. It also holds image and font files that code names, and credential-like patterns in files that have no part in the Claude plugin. Every hook and the MCP server here are Node.js files, and `plugins/concise` also holds Codex, omp, and console files. A tree at the branch root, with only the Claude plugin, removes those holds. See the [pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist).

## What the tree holds

`scripts/directory-tree.mjs` copies every git-tracked file in `plugins/concise` except the paths in `EXCLUDED`:

| Left out | Why |
|---|---|
| `.codex-plugin/`, `.codex-mcp.json`, `hooks/codex.json` | Codex manifests |
| `omp/`, `package.json` | omp extension |
| `hooks/monitor-filter.mjs`, `hooks/PreToolUse-test-filter.sh` | The Codex and omp test command rewrite, which approves the rewritten command |
| `web/` | The `concise-web` console, which ships through npm |
| `test/` | The plugin test suite |
| `assets/` except `assets/icon.svg` | Console fonts and Codex icons. The listing reads `icon` from `plugin.json` |

A new runtime file or folder goes into the tree with no change to the script. A new file that only Codex, omp, the console, or the tests use must go into `EXCLUDED`. `test/directory-tree.test.mjs` fails when a kept file imports or links a file that the tree leaves out, when a manifest runs a missing file, when a file is not text, or when a file returns a permission approval.

## How it is published

After the npm publish step, the "Publish Claude directory branch" step in `.github/workflows/release.yml`:

1. Reads `version` from `plugins/concise/.claude-plugin/plugin.json`.
2. Checks out `claude-directory` in a worktree, or creates it as an orphan branch.
3. Stops when the branch already has that version, so only a release changes the branch.
4. Runs `node scripts/directory-tree.mjs <worktree>`, commits `chore(release): claude-directory <version>`, and pushes with `GITHUB_TOKEN`.

The Checks workflow runs only for `main`, so pushes to `claude-directory` start no CI.

## Directory portal settings

| Field | Value |
|---|---|
| Repository | `yannelli/be-concise` |
| Plugin path | Empty |
| Branch or tag | `claude-directory` |

The portal follows that branch. After a release, the directory scans the new commit.

## Build the tree locally

```sh
node scripts/directory-tree.mjs /tmp/concise-directory
claude plugin validate --strict /tmp/concise-directory
```
