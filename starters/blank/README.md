# `starters/blank` — moved

The `blank` starter now lives in the standalone starters monorepo:

[`AotterClam/mantle-starters/blank/`](https://github.com/AotterClam/mantle-starters/tree/main/blank)

(Repo URL above is the post-rename name; if your tooling still pins
the original `mantle-starter-publication`, GitHub auto-redirects.)

## Why this moved

Real-user installs go through `@aotterclam/create-mantle`, which
fetches a tagged tarball of the starters monorepo and merges
`_common/` + `<archetype>/` into the user's empty directory. Keeping
`starters/blank` inside this SDK monorepo created two problems:

- Workspace-rooted `workspace:*` deps that don't resolve when
  end-users extract the starter standalone.
- A second source of truth for the headless API surface — anything
  added to `publication/` had to be remembered for `blank/` too.

Moving the starter into the monorepo fixes both. The same engineering
forcing function we use for `packages/adapters/netlify/` (#99): a
stub README points outward, so PR reviewers can spot a coupling slip
before it ships.

## See also

- [`packages/adapters/netlify/README.md`](../../packages/adapters/netlify/README.md) — same stub pattern, different reason.
- [`AotterClam/mantle#97`](https://github.com/AotterClam/mantle/issues/97) — Epic that moved the starters out.
