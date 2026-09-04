# Repository guidance

## Branches and releases

- Create feature branches from `dev`, using `<type>/<short-description>`.
- Target `dev` for ordinary PRs and squash merge with the PR title as the commit subject.
- Promote `dev` to `main` with a PR and merge commit to preserve Conventional Commits. Use `chore(release): promote dev to main` as its title.
- `main` is the default branch and publishes stable releases automatically. `dev` is the integration branch and does not publish releases.
- Release automation owns version files, release notes, and tags. Do not edit versions or create release tags manually.
- The release workflow merges `main` back into `dev` after releases to include the release bot's version updates and preserve history.

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

For breaking changes, add `!` to the commit subject and PR title and explain the migration in the PR body. A commit body can also use `BREAKING CHANGE: <migration details>`. Preserve breaking markers in squash commits.

PR bodies describe the behavior changed, the checks run, and any migration. Do not claim checks that were not run.

## Validation

Use Node.js 24, Bash, and `jq`. Run:

```sh
node scripts/check.mjs
node --test test/*.test.mjs
node plugins/concise/test/run-tests.mjs
```

Preview a release with `node scripts/release.mjs --dry-run` from a clean `main` checkout after fetching tags. Release automation uses Node.js and the GitHub API without package dependencies.
