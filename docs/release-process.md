# Release process

mantle is in `0.0.x-alpha` until the v0.1.0 release gate closes. The process below documents the intended branch, tag, and publish discipline even while npm publishing remains TBD.

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
9. Publish packages only after the npm flow below is resolved.

## npm publish after v0.1.0

The package publish flow is intentionally TBD until the v0.1.0 release decision lands. Track that decision in #1 and keep any publish automation out of the release path until the decision is made.

When the decision lands, this document must be updated with:

- registry target,
- access level,
- provenance setting,
- dry-run command,
- exact publish command,
- rollback or yanking policy.

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
