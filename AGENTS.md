# Repository guidance

## Branches and releases

- Create feature branches from `dev`, using `<type>/<short-description>`.
- Target `dev` for ordinary PRs and use a merge commit with the PR title as its subject. The repository permits merge commits for PRs.
- Promote `dev` to `main` with a PR and merge commit to preserve Conventional Commits. Use `chore(release): promote dev to main` as its title.
- `main` is the default branch and publishes stable releases automatically. `dev` is the integration branch and does not publish releases.
- Release automation owns version files, release notes, and tags. Do not edit versions or create release tags manually.
- The release workflow merges `main` back into `dev` after releases to include the release bot's version updates and preserve history.
- The release workflow publishes `@yannelli/be-concise` to npm through trusted publishing. Read [.agents/docs/INDEX.md](.agents/docs/INDEX.md) before changing release or publishing behavior.

## Commits and PRs

Use Conventional Commits for commit subjects and PR titles:

```text
<type>(<optional-scope>)[!]: <imperative description>
```

Keep subjects within 72 characters, without a trailing period. Choose the type from the change's behavior:

| Change | Version bump |
| --- | --- |
| `feat` | Minor |
| `fix`, `perf`, `revert` | Patch |
| Any type with `!` or a `BREAKING CHANGE:` footer | Major, including before 1.0 |
| `docs`, `chore`, `ci`, `build`, `refactor`, `style`, `test` | No release without a breaking marker |

For breaking changes, add `!` to the commit subject and PR title and explain the migration in the PR body. A commit body can also use `BREAKING CHANGE: <migration details>`.

PR bodies describe the behavior changed, the checks run, and any migration. Do not claim checks that were not run.

## Docs

[plugins/concise/docs/INDEX.md](plugins/concise/docs/INDEX.md) lists the plugin docs with their dates. Before you change `hooks/hooks.json`, `hooks/codex.json`, `.mcp.json`, `.codex-mcp.json`, or a plugin manifest, read [plugins/concise/docs/host-features.md](plugins/concise/docs/host-features.md) and check its sources for changes. Update its dates and the index when you change it.

## Validation

Use Node.js 24, Bash, and `jq`. Run:

```sh
node scripts/check.mjs
node --test test/*.test.mjs
env -u HOME -u USERPROFILE -u XDG_CONFIG_HOME node plugins/concise/test/run-tests.mjs
```

CI runs these with `NODE_V8_COVERAGE` set, then `node scripts/coverage.mjs "$NODE_V8_COVERAGE"` fails the job when a source line never ran. To check locally, export `NODE_V8_COVERAGE=<empty dir>`, run the three commands, then run the script with that directory. Cover new code with tests; mark a line `coverage-ignore: <reason>` only when no test can reach it.

Preview a release with `node scripts/release.mjs --dry-run` from a clean `main` checkout after fetching tags. Release automation uses Node.js and the GitHub API without package dependencies.
