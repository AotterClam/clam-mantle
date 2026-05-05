# Starter snapshots

Frozen reference copies of past starter designs. **Not maintained** — these
do not track SDK upgrades, do not run in CI, are excluded from the workspace
(see root `pnpm-workspace.yaml`).

Why keep them: when a starter undergoes a design overhaul, the previous
visual identity often has standalone value as inspiration or as a fallback
"I want it back the way it was". Tagging git commits is fine for archeology
but doesn't give a consumer a directory they can `cp -r` and adapt. These
do.

## Snapshots

- **`blog-editorial-2026-05-05/`** — the editorial-typography blog starter
  shipped in the `starter→SDK lift` push (HEAD `2e80688`, 2026-05-05). Serif
  display (Fraunces / Source Serif 4 / Noto Serif TC), single vermillion
  accent, drop caps, glyph 404, mono-uppercase metadata, sticky header with
  popover theme + lang switchers. Replaced by a neutralized
  `theme.default/` baseline plus an L1–L4 customization stack as part of
  the v0.1.0 starter overhaul.

## Re-using a snapshot

```bash
# 1. Copy the snapshot somewhere outside the monorepo (or back into
#    starters/, with a fresh name).
cp -r starters/_archive/blog-editorial-2026-05-05 my-editorial-blog

# 2. Re-attach SDK deps. The package.json's `file:` paths inside the
#    snapshot point at the SDK version current at snapshot time; rewrite
#    them to your target version.
cd my-editorial-blog
sed -i '' 's|file:\.\./\.\./packages/|<your-target-paths>|g' package.json

# 3. Apply any SDK API migrations the changelog called out since the
#    snapshot date.
```

Snapshots are **read-only by convention**. Do not add commits that edit
snapshot directories — fork them out of the archive instead.
