# Release process

mantle is in `0.0.x-alpha` until the v0.1.0 release gate closes. The process below documents the branch, tag, GitHub release, and npm publish discipline for prereleases and stable releases.

## Branch model

- `develop` is the integration branch for all PRs.
- `main` is release-only.
- Release PRs merge `develop -> main`.
- Hotfixes branch from `main`, merge back to `main`, tag, then merge or cherry-pick back to `develop`.

## Versioning

- Use semver after v0.1.0.
- Tag format is `vMAJOR.MINOR.PATCH`, for example `v0.1.0`.
- Alpha tags may use prerelease suffixes, for example `v0.0.6-alpha`.
- Package versions must stay aligned unless a future ADR explicitly changes package release policy.

## Release channels

### Alpha

Alpha releases validate dogfood and integration flows. They may include
new capability, starter changes, and compatibility-breaking pre-v0.1
behavior. Use alpha for official-site dogfood, provision-path testing,
and early consumer projects that can tolerate churn.

- Version suffix: `-alpha`, e.g. `0.0.7-alpha`.
- Git tag: `v0.0.7-alpha`.
- GitHub Release: mark as prerelease.
- npm dist-tag: `alpha`.
- npm `latest`: do not intentionally move `latest` unless the owner
  explicitly decides alpha should be the default install path.
- Required before publish: `pnpm run check`, changelog entry,
  release PR merged to `main`, tag pushed.

### Beta

Beta means the v0.1 feature shape is close to complete. New feature work
should be rare and explicitly called out in the release PR.

- Version suffix: `-beta.N` once needed, e.g. `0.1.0-beta.1`.
- GitHub Release: prerelease.
- npm dist-tag: `beta`.
- Focus: bug fixes, docs, provision UX, migration/upgrade path.

### Release candidate

RC means "could become stable if no blocker appears." Only blocker fixes
should land between RCs.

- Version suffix: `-rc.N`, e.g. `0.1.0-rc.1`.
- GitHub Release: prerelease.
- npm dist-tag: `rc`.
- Focus: release blockers only.

### Stable

Stable releases use no prerelease suffix.

- Version: `0.1.0`, `0.1.1`, ...
- Git tag: `v0.1.0`.
- GitHub Release: not prerelease.
- npm dist-tag: `latest`.
- Focus: public install path and supported upgrade story.

## Normal release playbook

1. Confirm the release scope and blocking issues.
2. Ensure every merged PR has a changelog-worthy note when it affects users, package behavior, public docs, or release mechanics.
3. Run the full local gate from `develop`:

   ```bash
   pnpm run check
   ```

4. Open a release PR from `develop` to `main`.
5. Review the diff for accidental unreleased work.
6. Merge with a merge commit.
7. Tag the merge commit:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

8. Create GitHub release notes from `CHANGELOG.md`.
9. Publish packages using the channel rules below.

## npm publish

Published npm packages are the runtime dependency source for
agent-provisioned consumer projects (ADR-0013). Starter files may be
copied from GitHub, but `setup:site` rewrites runtime dependencies to
the selected npm version.

### Packages published in alpha

For `0.0.x-alpha`, publish SDK packages only:

1. `@aotter/mantle-spec`
2. `@aotter/mantle-admin-ui`
3. `@aotter/mantle-runtime`
4. `@aotter/mantle-cloudflare`

Do **not** publish starter packages during alpha unless a separate PR
explicitly prepares their package allowlists and verifies the tarballs.
Current starter install flow downloads starter source tarballs from
GitHub/template refs, extracts them without preserving the template
repo remote, and uses npm as the runtime dependency source.

Do **not** publish `@aotter/mantle-netlify` while it is a stub.

`@aotter/create-mantle` is **not** published to npm — it ships as
a `pnpm pack` tarball attached to each GitHub release, and the install
skill invokes it via `npx <release-tarball-url>`. The
`release-create-mantle` workflow builds + uploads the tarball
automatically on every `v*-alpha` / `v*-beta.*` / `v*.*.*` tag push;
no manual `npm publish` step. The scaffolder evolves on a faster
cadence than the SDK and is intentionally outside the published
library surface.

### Pre-publish checks

Run the full gate before publishing:

```bash
pnpm run check
```

Create package tarballs and inspect them before publishing:

```bash
mkdir -p /private/tmp/mantle-pack-check
pnpm -C packages/mantle-spec pack --pack-destination /private/tmp/mantle-pack-check
pnpm -C packages/mantle-admin-ui pack --pack-destination /private/tmp/mantle-pack-check
pnpm -C packages/mantle-runtime pack --pack-destination /private/tmp/mantle-pack-check
pnpm -C packages/adapters/cloudflare pack --pack-destination /private/tmp/mantle-pack-check
```

Confirm each tarball contains only intended `dist`, `README.md`,
`LICENSE`, and `package.json` payloads for that package. Do not publish
tarballs containing local state, `.wrangler/`, secrets, fixtures, or
workspace-only artifacts.

### Alpha publish command

Publish prerelease packages with the `alpha` dist-tag:

```bash
npm publish --access public --tag alpha <tarball>
```

Publish in dependency order:

1. spec
2. admin-ui
3. runtime
4. cloudflare

After publishing, verify:

```bash
npm view @aotter/mantle-spec version dist-tags --json
npm view @aotter/mantle-admin-ui version dist-tags --json
npm view @aotter/mantle-runtime version dist-tags dependencies --json
npm view @aotter/mantle-cloudflare version dist-tags dependencies --json
```

### Rollback / yanking policy

Do not use npm unpublish as the normal rollback mechanism. If an alpha
is broken:

1. Publish the next alpha with a higher version.
2. Deprecate the broken version with a clear message.

Example:

```bash
npm deprecate @aotter/mantle-runtime@0.0.7-alpha "Broken alpha; use 0.0.8-alpha"
```

Only unpublish when the tarball contains secrets, private files, or a
severely wrong package. Remember that npm package versions cannot be
reused after unpublish.

## Hotfix process

Use hotfixes only for released `main` defects.

1. Branch from `main`:

   ```bash
   git checkout -b fix/issue-NN-hotfix origin/main
   ```

2. Keep the patch narrow.
3. Run the relevant tests and the full gate when feasible.
4. Open the PR against `main`.
5. Merge, tag a patch release, and update GitHub release notes.
6. Merge or cherry-pick the hotfix back to `develop`.

## Pre-flight checklist

- [ ] PR base is correct for the release type.
- [ ] `CHANGELOG.md` has the release entry.
- [ ] `pnpm run check` passed or failures are documented and accepted.
- [ ] Package versions and tag name match.
- [ ] GitHub release notes link the relevant issues and ADRs.
- [ ] npm publish steps are either completed or explicitly not applicable.
