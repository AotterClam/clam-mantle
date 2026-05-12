# `@aotterclam/create-clam-cms`

npx scaffolder for clam-cms v0.1.0 consumer projects. **Not published to npm** — distributed as a tarball attached to each `clam-cms` GitHub release. `npx` resolves the URL directly, so installs don't require an npm registry round-trip.

```bash
npx https://github.com/AotterClam/clam-cms/releases/download/v0.0.8-alpha/aotterclam-create-clam-cms-0.0.8-alpha.tgz \
  <archetype> \
  --project-name <name> \
  --brand "<brand>" \
  --description "<one-line>" \
  --locales "zh-TW,en" \
  --github-owner <gh-login> \
  --summary "<Mantle's one-line install description>"
```

The Mantle install skill ([`skills/install/SKILL.md`](../../skills/install/SKILL.md)) interpolates this URL pinned to the release the skill itself is read from.

## What it does

1. Resolves `<archetype>` against the bundled source map → starters
   monorepo (`AotterClam/clam-cms-starters` for public archetypes;
   `AotterClam/clam-cms-starters-premium` for private — deferred).
2. Downloads a tarball of that repo at `--starter-ref` (default
   `main`).
3. Extracts and merges `_common/` + `<archetype>/` + each overlay (in
   order) into the destination directory.
4. Substitutes `{{PLACEHOLDER}}` macros per ADR-0016.
5. Renames `<file>.template` → `<file>` (so
   `_common/AGENTS.md.template` lands as `AGENTS.md`).
6. Fails fast if any `{{PLACEHOLDER}}` remains.
7. Runs `git init` (no remote) and `pnpm install`.
8. Prints a JSON `RUN_NOTES` shape on stdout — the Mantle install
   skill reads this to know what to do next.

## RUN_NOTES JSON shape

```json
{
  "archetype": "presence",
  "starter_source": "AotterClam/clam-cms-starters/publication",
  "overlays": [],
  "files_written": ["AGENTS.md", "mantle/site.md", "package.json", "..."],
  "next_step": "Mantle: replace HTML comments in mantle/site.md with prose from interview; then commit + invoke provision skill."
}
```

## Archetypes

| Key | Status | Source path | Notes |
|---|---|---|---|
| `presence` | ready | `publication` | Mood default minimal/editorial |
| `publication` | ready | `publication` | Mood default editorial/playful |
| `intake` | ready | `publication` + `overlays: ["intake"]` | Adds Form schema |
| `blank` | ready | `blank` | Headless backend; no UI |
| `transaction` | roadmap | — | v0.2 micro-shop |
| `reservation` | roadmap | — | v0.2 booking |
| `community` | roadmap | — | v0.2 end-user auth |
| `membership` | roadmap | — | v0.2 end-user auth + entitlements |

Roadmap archetypes are refused early by the install Skill; this
package never gets called with them. If it is, it throws with a clean
message.

## Adding an archetype

1. Edit `src/sources.ts` — add the entry under `SOURCES`.
2. Update the table in this README.
3. Make sure `clam-cms-starters` already has the directory the entry
   points at (and any overlay).
4. Ship a new package version.

## Source layering

```
_common/<file>        → <file>
<archetype>/<file>    → <file>
overlays[i]/<file>    → <file>   (in order)
```

Later layers overwrite earlier files on conflict. `_common/` carries
the AGENTS.md + mantle/site.md backbone; archetype dirs carry the
runtime code, manifests, and scripts.

## Replaces

The manual `curl … | tar -xzf …` + `pnpm run setup:site` ritual that
used to live in `skills/install/SKILL.md`. After this package ships,
the install Skill invokes a single non-interactive `npx` and reads
the RUN_NOTES instead.

The starters' own `setup:site` script keeps working for in-project
reconfiguration; it just stops being the install-time entry point.

## Local dev

```bash
pnpm install
pnpm build
pnpm test
```

The test suite uses an offline fixture tree (no network, no
`gh auth`) — it constructs a fake extracted tarball under a temp dir
and runs the local install path directly. See
`test/install.test.ts`.

## See also

- [ADR-0016](../../docs/adr/0016-site-semantic-layer.md) — placeholder
  macro list + update workflow
- [ADR-0013](../../docs/adr/0013-agent-provisioned-consumer-projects.md)
  — the broader agent-provisioned install flow
- [`AotterClam/clam-cms-starters`](https://github.com/AotterClam/clam-cms-starters)
  — public starters monorepo this package dispatches against
