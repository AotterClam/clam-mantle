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
- npm `latest` (pre-v0.1.0 policy): `latest` tracks the most
  user-useful pre-release for default `npm install` (no tag) calls.
  Concretely: when a beta exists, `latest` follows the most recent
  beta; otherwise it follows the most recent alpha. Once v0.1.0
  stable ships, `latest` switches to stable-only and never points
  at a prerelease again.
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

For `0.0.x-alpha`, publish SDK packages in dependency order:

1. `@aotter/mantle-spec`
2. `@aotter/mantle-admin-ui`
3. `@aotter/mantle-runtime`
4. `@aotter/mantle-cloudflare`
5. `@aotter/mantle` (umbrella — depends on all four above; publish last so its exact-pinned `dependencies` resolve)

The umbrella is the adopter-facing entry: a single dep, subpath imports
`@aotter/mantle/{spec,runtime,cloudflare,admin-ui}`. Sub-packages
stay individually installable for tooling / alt-adapter authors.

Do **not** publish starter packages during alpha unless a separate PR
explicitly prepares their package allowlists and verifies the tarballs.
Current starter install flow downloads starter source tarballs from
GitHub/template refs, extracts them without preserving the template
repo remote, and uses npm as the runtime dependency source.

Do **not** publish `@aotter/mantle-netlify` while it is a stub.

`@aotter/create-mantle` lives in `aotter/mantle-starters`,
not here. The scaffolder couples to starter content (sources.json,
merge layout, placeholder macros) and has zero coupling to SDK runtime,
so it ships from the starters repo. Releases on this SDK repo no longer
attach a create-mantle tarball — that asset is published to npm
from the starters repo's matching release tag.

Adopters install via the `npm create` shortcut (npm 7+ resolves
`@aotter/mantle` to `@aotter/create-mantle`):

```bash
npm create @aotter/mantle@alpha <archetype> -- \
  --project-name "..." \
  --brand "..." \
  --description "..." \
  --locales "..." \
  --github-owner "..." \
  --summary "..."
```

Equivalent direct invocations: `npx @aotter/create-mantle@alpha
<archetype> ...` or pinning to an exact version
`npx @aotter/create-mantle@0.0.10-alpha.1 ...`.

`skills/install/SKILL.md` carries the canonical invocation.

### Pre-publish checks

Run the full gate before publishing:

```bash
pnpm run check
```

Run `pnpm build` from the workspace root first so `dist/` exists for
every package — `pnpm publish` does NOT run the build lifecycle scripts
by default, and a tarball published without `dist/` is a wasted version
slot (npm forbids republishing the same version, and `npm unpublish`
needs an OTP not always to hand). Then pack + inspect:

```bash
pnpm run check                          # boundary + build + typecheck + test
mkdir -p /tmp/mantle-pack
pnpm -C packages/mantle-spec       pack --pack-destination /tmp/mantle-pack
pnpm -C packages/mantle-admin-ui   pack --pack-destination /tmp/mantle-pack
pnpm -C packages/mantle-runtime    pack --pack-destination /tmp/mantle-pack
pnpm -C packages/adapters/cloudflare    pack --pack-destination /tmp/mantle-pack
pnpm -C packages/mantle            pack --pack-destination /tmp/mantle-pack
tar tzf /tmp/mantle-pack/aotter-mantle-<ver>.tgz | head    # spot-check
```

Confirm each tarball contains only intended `dist`, `README.md`,
`LICENSE`, and `package.json` payloads for that package. Do not publish
tarballs containing local state, `.wrangler/`, secrets, fixtures, or
workspace-only artifacts.

### Alpha publish command

Publish prerelease packages with the `alpha` dist-tag, in dep order:

```bash
pnpm publish --filter @aotter/mantle-spec       --no-git-checks --access public
pnpm publish --filter @aotter/mantle-admin-ui   --no-git-checks --access public
pnpm publish --filter @aotter/mantle-runtime    --no-git-checks --access public
pnpm publish --filter @aotter/mantle-cloudflare --no-git-checks --access public
pnpm publish --filter @aotter/mantle            --no-git-checks --access public
```

Or one-shot:

```bash
pnpm -r publish --no-git-checks --access public --tag alpha
```

`pnpm publish` resolves `workspace:*` deps to the actual published
version at pack time, so the umbrella's `dependencies` lock to the
exact `0.0.X-alpha` of each sub-package once the publish completes.

**DO NOT use `npm publish` directly** inside a workspace package.
`npm publish` (unlike `pnpm publish`) does **not** rewrite `workspace:*`
specifiers — they ship to the registry verbatim as the literal string
`"workspace:*"`, which no consumer can resolve. Recovery requires
bumping past the broken version (see "Rollback / yanking policy") since
republishing the same version is forbidden. Saw this concretely on the
0.0.11-alpha rename round: mantle-runtime / cloudflare / umbrella all
shipped broken via `npm publish` and had to be republished at
0.0.11-alpha.3 via `pnpm publish`.

Confirm zero `workspace:*` leaked into published deps:

```bash
for p in @aotter/mantle{-spec,-admin-ui,-runtime,-cloudflare,}; do
  echo "=== $p"
  npm view "$p@alpha" dependencies --json | grep -i workspace && echo "  ⚠ LEAK"
done
```

`pnpm publish` uses `publishConfig.tag` (set to `alpha` on every
package) but `npm` also assigns the `latest` dist-tag by default. Per
the pre-v0.1 `latest` policy above, that's the correct behavior; no
action needed. Add the `alpha` tag explicitly only if it's missing:

```bash
npm dist-tag add @aotter/mantle@<ver> alpha
```

After publishing, verify:

```bash
for p in @aotter/mantle{-spec,-admin-ui,-runtime,-cloudflare,}; do
  npm view "$p" version dist-tags --json
done
```

Note: `npm view` against a freshly-published name can 404 for 5–15 min
while the Fastly read-side cache propagates. The write side (and
`pnpm publish`'s "cannot publish over the previously published
versions" sanity check) is the authoritative confirmation that the
publish landed.

**For consumer projects depending on the just-published packages**,
also smoke-test installability after publish:

```bash
mkdir -p /tmp/install-smoke && cd /tmp/install-smoke
echo '{"name":"smoke","private":true}' > package.json
npm install @aotter/mantle@alpha --no-package-lock --no-save
ls node_modules/@aotter/mantle  # expect: dist/ package.json README.md
```

If `npm install` 404s for >15 min despite `pnpm publish` succeeding,
the metadata doc is likely tombstoned (see Rollback policy below for
the 24h unpublish cooldown).

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
severely wrong package. Remember:

- npm package versions cannot be reused after unpublish (forever).
- After unpublishing, the **package's metadata document is tombstoned
  for 24 hours**. Republishing the SAME version is forbidden, AND new
  versions you publish during the cooldown can land but the `npm view`
  / `npm install` read path returns 404 because the metadata doc is in
  a frozen state. Saw this concretely on 0.0.11-alpha rename:
  unpublished a workspace-leaked umbrella, republished as
  0.0.11-alpha.1 and .alpha.2 — both were technically published (the
  registry refused republish with "previously published versions"
  errors) but invisible to consumers. Only `0.0.11-alpha.3` (after a
  version-number "jump") cleared the tombstone.

Safer rollback discipline: skip unpublish entirely. Just bump + deprecate.

## Cross-cutting rename playbook

A "rename" here means a substring-level identifier shift that crosses
multiple repos / packages (e.g. `mantle` → `mantle` on 2026-05-16).
These are once-per-product-life events. The rules below cost ~30 minutes
of pre-flight; skipping them cost a half-day of outage when ignored.

### Step 1 — pre-flight grep for substring false-positives

A naive `sed s/OLD/NEW/g` matches OLD as a **substring** of unrelated
identifiers. Concrete trap: renaming `mantle` → `mantle` hit
`aotter-mantle` (the CF worker name) → `aottermantle`. The
auto-deploy after merge created an orphan worker without secrets;
`the Mantle landing page` returned 503 for 30 minutes.

Before the sed, search for shapes where OLD could appear as a substring
of a meaningful different identifier:

```bash
# Substring of an unrelated infra identifier?
git grep -E "[a-zA-Z]+-?${OLD_NAME}" -- '*.toml' '*.yaml' '*.yml' '*.json'

# Specifically check Cloudflare worker / D1 / KV / DO names
git grep -nE "^name|database_name|class_name|queue.*name" -- wrangler.toml '**/wrangler.toml'

# CI workflow names / step IDs
git grep -nE "name:|id:" -- '.github/workflows/**'
```

Hand-edit (or use word-boundary regex) any match that should *not* shift.

### Step 2 — post-sed infra-config diff

After the bulk replace, **explicitly diff every infrastructure config
file** even if the change looks mechanical:

```bash
git diff --name-only HEAD~1 | grep -E "wrangler|workflow|toml|terraform|kubernetes"
git diff HEAD~1 -- wrangler.toml '**/wrangler.toml'
```

Eyeball each line. Worker / DB / queue names that shift mean wrangler
will deploy to a NEW resource without secrets / bindings — silent
disaster.

### Step 3 — CI green ≠ deploy OK

The deploy workflow can report success while the live URL is broken.
Reasons: secrets don't carry to a renamed worker, route bindings
re-attach to the new (empty) worker, etc.

**Always smoke-test the live URL after a config-touching deploy:**

```bash
sleep 60   # Let the deploy + DNS propagate
for path in / /zh-TW /skill/install /admin; do
  code=$(curl -sIo /dev/null -w "%{http_code}" "https://<your-site>$path")
  echo "  $path → $code"
done
```

5xx without an obvious source-level cause usually means
infrastructure-config drift, not application bug.

### Step 4 — Cross-repo rename order

For renames spanning SDK + starters + landing (or any
SDK-depends-on-published-SDK chain):

1. Source-level rename in all repos, open PRs, **do not merge yet**.
2. Verify each PR's CI (where present); typecheck on source-only
   without lockfile refresh.
3. From the SDK rename branch: `pnpm build`, then `pnpm -r publish
   --no-git-checks --access public --tag alpha`. Verify no `workspace:*`
   leak (see "Alpha publish command" above).
4. On each consumer PR (starters, landing): bump the SDK dep to the
   freshly-published version, run `pnpm install`, push the refreshed
   lockfile.
5. Merge consumer PRs.
6. Smoke-test live URLs.
7. Deprecate old packages: `npm deprecate @aotter/OLD@'*' "Renamed
   to @aotter/NEW"`.

GitHub repo renames (`gh repo rename`) and local-dir renames can happen
anytime — GitHub auto-redirects old URLs to new ones; no consumer
breakage from this step alone.

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
- [ ] Publish used `pnpm publish` (not `npm publish`) — verify no
      `workspace:*` leaked into published `dependencies` via the check
      script in the "Alpha publish command" section.
- [ ] Cross-repo rename? Pre-flight grep for substring false-positives
      ran (see "Cross-cutting rename playbook"); infra-config diff
      explicitly reviewed; consumer-repo lockfiles refreshed after the
      SDK publish lands.
- [ ] Smoke-tested live downstream URL (e.g. `the Mantle landing page`)
      after consumer-repo deploys — CI green is not enough when infra
      config (wrangler.toml `name`, D1 / KV / DO bindings) shifted.
- [ ] npm publish steps are either completed or explicitly not applicable.
