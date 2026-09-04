# Development and releases

Use Node.js from `.nvmrc`, Bash, and `jq`.

## Branches

`main` is the default branch and contains releases. Create feature branches from `dev` and open ordinary PRs against `dev`. Merge using the PR title and body; GitHub is configured to use those fields for the merge commit. Squash and rebase merges are disabled to preserve release history.

To release, open a PR from `dev` to `main`, titled `chore(release): promote dev to main`. Merge it with a **merge commit** to preserve the individual changes used for version calculation. A squash merge discards those commit messages.

## Commit and PR format

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit subjects and PR titles:

```text
fix(codex): handle empty reply transcripts
feat(config): add a preset
feat(config)!: remove the legacy configuration format
```

Keep subjects within 72 characters. Use an imperative description without a trailing period. PR bodies describe changed behavior, validation, and migration steps for breaking changes.

Versions follow [Semantic Versioning](https://semver.org/):

| Commit | Release |
| --- | --- |
| `fix`, `perf`, `revert` | Patch: `0.5.1` → `0.5.2` |
| `feat` | Minor: `0.5.1` → `0.6.0` |
| Any type with `!` or a `BREAKING CHANGE:` footer | Major: `0.5.1` → `1.0.0` |
| `docs`, `chore`, `ci`, `build`, `refactor`, `style`, `test` | No release without a breaking marker |

The highest bump among unreleased commits wins. The major-bump policy also applies before `1.0.0`. For breaking changes, put `!` in the commit subject and PR title and describe the migration in the body. `BREAKING-CHANGE:` is also accepted by Conventional Commits.

The plugin's compatibility surface includes configuration keys, environment variables, hooks, and documented behavior.

## Validation

```sh
node scripts/check.mjs
node --test test/*.test.mjs
env -u HOME -u USERPROFILE -u XDG_CONFIG_HOME node plugins/concise/test/run-tests.mjs
```

Checks validate JavaScript syntax, JSON, matching plugin versions, PR titles and branch targets, and the test suite. The repository has no separate type checker.

## Release ownership

Automation owns the versions in `.claude-plugin/marketplace.json`, `plugins/concise/.claude-plugin/plugin.json`, and `plugins/concise/.codex-plugin/plugin.json`, plus release notes and `vX.Y.Z` tags. Keep these versions unchanged in feature PRs. The existing `v0.5.1` tag is the baseline for automated releases.

`dev` does not publish releases. Changes without a release-triggering commit remain unreleased until a qualifying change reaches `main`.

Each push to `main` runs the checks, computes the highest version bump since the latest reachable stable tag, updates the three manifests, pushes a release commit and annotated tag together, and publishes a GitHub release with generated notes. The workflow then merges `main` into `dev` to carry the versions forward. It uses the repository's `GITHUB_TOKEN` with `contents: write` and requires no additional secrets or dependencies.

Bot pushes do not start another workflow. Release validation and the merge back into `dev` run in the same workflow. See [GitHub's workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Preview from a clean, up-to-date `main` checkout with all tags fetched:

```sh
node scripts/release.mjs --dry-run
```

To retry an interrupted release or a failed merge back into `dev`, rerun the Release workflow on `main`. A retry publishes a missing GitHub release from the existing annotated tag before processing newer commits. If `dev` has a merge conflict, resolve it by merging `main` into `dev`, then rerun. Branch rules must permit the release bot to push version commits, tags, and the merge into `dev`.
