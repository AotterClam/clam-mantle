# `@aotterclam/create-clam-cms`

npx scaffolder for clam-cms v0.1.0 consumer projects. **Not published to npm** — distributed as a tarball attached to each `clam-cms` GitHub release. `npx` resolves the URL directly, so installs don't require an npm registry round-trip.

```bash
npx https://github.com/AotterClam/clam-cms/releases/download/v0.0.8-alpha.1/aotterclam-create-clam-cms-0.0.8-alpha.1.tgz \
  <archetype> \
  --project-name <name> \
  --brand "<brand>" \
  --description "<one-line>" \
  --locales "zh-TW,en" \
  --github-owner <gh-login> \
  --summary "<Mantle's one-line install description>" \
  [--theme <theme-key>] \
  [--ref <git-ref>]
```

The Mantle install skill ([`skills/install/SKILL.md`](../../skills/install/SKILL.md)) interpolates this URL pinned to the release the skill itself is read from.

## What it does

1. Fetches `sources.json` from `AotterClam/clam-cms-starters` at the requested ref (default `main`) — resolves archetype → starter path + (optional) theme overlay. Falls back to a bundled stale snapshot if GH is unreachable.
2. Downloads a tarball of `clam-cms-starters` at the same ref.
3. Extracts and merges into the destination directory in this order: `_common/` → `<archetype>/` → each archetype overlay (in order) → (optional) `themes/<theme-key>/`. Later layers overwrite earlier files on conflict.
4. Substitutes `{{PLACEHOLDER}}` macros per ADR-0016.
5. Renames `<file>.template` → `<file>` (so `_common/AGENTS.md.template` lands as `AGENTS.md`).
6. Fails fast if any `{{PLACEHOLDER}}` remains.
7. Runs `git init` (no remote) and `pnpm install`.
8. Prints a JSON `RUN_NOTES` shape on stdout — the Mantle install skill reads this to know what to do next.

## CLI flags

| Flag | Required | Default | Notes |
|---|---|---|---|
| (positional `<archetype>`) | yes | — | `presence` / `publication` / `intake` / `blank`. Roadmap keys refused. |
| `--project-name` | yes | — | Lowercase, hyphenated. Becomes wrangler worker name. |
| `--brand` | yes | — | Public display name. |
| `--description` | yes | — | One-line public description. |
| `--locales` | yes | — | Comma-separated BCP 47 list. First is canonical. |
| `--canonical-locale` | no | first `--locales` | Override canonical locale explicitly. |
| `--github-owner` | yes | — | Becomes `ADMIN_GITHUB_LOGIN`. |
| `--summary` | yes | — | Mantle's one-line install summary; lands in `mantle/site.md` `revisions[0].summary`. |
| `--theme` | no | none | Theme overlay key resolved against `sources.themes`. |
| `--ref` | no | `main` | Git ref for both `sources.json` and the tarball. `--starter-ref` retained as alias. |

## RUN_NOTES JSON shape

```json
{
  "archetype": "presence",
  "theme": null,
  "starter_source": "AotterClam/clam-cms-starters/publication",
  "theme_source": null,
  "overlays": [],
  "files_written": ["AGENTS.md", "mantle/site.md", "package.json", "..."],
  "next_step": "Mantle: replace HTML comments in mantle/site.md with prose from interview; then commit + invoke provision skill."
}
```

With a theme applied:

```json
{
  "archetype": "publication",
  "theme": "l4-editorial-warm",
  "starter_source": "AotterClam/clam-cms-starters/publication",
  "theme_source": "AotterClam/clam-cms-starters/themes/l4-editorial-warm",
  ...
}
```

## Source map: runtime fetch

`sources.json` lives at the root of [`AotterClam/clam-cms-starters`](https://github.com/AotterClam/clam-cms-starters) and is fetched at runtime. Schema:

```json
{
  "archetypes": {
    "presence":    { "path": "presence" },
    "publication": { "path": "publication" },
    "intake":      { "path": "intake" },
    "transaction": { "path": "transaction" },
    "blank":       { "path": "blank" }
  },
  "themes": {
    "l4-minimal-ink":    { "path": "themes/l4-minimal-ink" },
    "l4-editorial-warm": { "path": "themes/l4-editorial-warm" }
  },
  "roadmap": ["reservation", "community", "membership"]
}
```

Adding an archetype or theme = update `sources.json` in `clam-cms-starters`. This package does not need a new version unless the merge logic itself changes.

Fetch failures (network down, GH unreachable, schema invalid) fall back to a bundled snapshot in `src/sources.ts` (`STALE_FALLBACK_SOURCES`); a warning lands on stderr.

## Source layering

```
_common/<file>          → <file>
<archetype>/<file>      → <file>      (overwrites _common on conflict)
overlays[i]/<file>      → <file>      (overwrites earlier on conflict; in order)
themes/<theme>/<file>   → <file>      (last; theme wins on conflict)
```

`_common/` carries the AGENTS.md + mantle/site.md backbone; archetype dirs carry the runtime code, manifests, and scripts; theme overlays touch `src/theme/` only.

## Local dev

```bash
pnpm install
pnpm build
pnpm test
```

The test suite uses an offline fixture tree (no network, no `gh auth`) — it constructs a fake extracted tarball under a temp dir and runs the local install path directly. See `test/install.test.ts`. Network paths (`fetchSourcesJson`) are tested with mocked `fetch`.

## Replaces

The manual `curl … | tar -xzf …` + `pnpm run setup:site` ritual that used to live in `skills/install/SKILL.md`. After this package ships, the install Skill invokes a single non-interactive `npx` and reads the RUN_NOTES instead.

The starters' own `setup:site` script keeps working for in-project reconfiguration; it just stops being the install-time entry point.

## See also

- [ADR-0016](../../docs/adr/0016-site-semantic-layer.md) — placeholder macro list + update workflow
- [ADR-0013](../../docs/adr/0013-agent-provisioned-consumer-projects.md) — the broader agent-provisioned install flow
- [Epic #116](https://github.com/AotterClam/clam-cms/issues/116) — v0.0.9 install UX pivot (Mantle scope narrow + 1:1 starter + theme overlay; this package is sub-issue #121)
- [`AotterClam/clam-cms-starters`](https://github.com/AotterClam/clam-cms-starters) — public starters monorepo this package dispatches against
