# npm trusted publishing

Created: 2026-10-05
Last updated: 2026-10-05

The Release workflow (`.github/workflows/release.yml`) publishes `@yannelli/be-concise` to npm after it creates a GitHub release. This page records the npm behavior that the workflow depends on.

## How the workflow publishes

1. `scripts/release.mjs --publish` updates the version in `package.json` and the plugin manifests, then commits, tags, and pushes.
2. The "Publish npm package" step reads `name` and `version` from `package.json`. It runs `npm publish` when `npm view <name>@<version> version` does not print that version. A rerun of the workflow repeats a failed publish and skips a version that npm already has.
3. `publishConfig` in `package.json` sets `access: public` and `provenance: true`.

The step runs before the merge back into `dev`, while the checkout is on the `main` release commit.

## Authentication

The workflow grants `id-token: write`. The npm CLI tries OIDC trusted publishing first, then the token in `NODE_AUTH_TOKEN`, which comes from the `NPM_TOKEN` repository secret.

Requirements for trusted publishing:

- npm CLI 11.5.1 or later and Node.js 22.14.0 or later. Node.js 24.19.0 from `.nvmrc` bundles npm 11.17.0.
- `repository.url` in `package.json` matches the GitHub repository.
- The trusted publisher on npm names owner `yannelli`, repository `be-concise`, and workflow file `release.yml`.
- The package exists on npm before the trusted publisher is added (`npm help trust`).

With trusted publishing from a public repository, npm adds provenance without the `--provenance` flag.

## Token restrictions

Since 2026-07-31, granular access tokens that bypass 2FA cannot change trusted publishing configuration, package access, or tokens. GitHub plans to remove their direct publish access in January 2027. Configure the trusted publisher interactively with 2FA.

## Setup after the first publish

1. Add the trusted publisher with 2FA, on the package's Settings page on npmjs.com or with:

   ```sh
   npm trust github @yannelli/be-concise --repo yannelli/be-concise --file release.yml --allow-publish
   ```

2. In the package's Settings, under Publishing access, select "Require two-factor authentication and disallow tokens".
3. Delete the fallback secret and revoke its token on npmjs.com:

   ```sh
   gh secret delete NPM_TOKEN -R yannelli/be-concise
   ```

## Sources

- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers)
- [Restricting npm bypass-2FA granular access tokens](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/)
- `npm help trust` (npm 12.0.2)
