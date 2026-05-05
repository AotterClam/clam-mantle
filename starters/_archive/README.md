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

The snapshot's `package.json` declares its SDK dependencies as
`workspace:*`. That works as-is **inside this monorepo** (back into
`starters/` under a fresh name). For use **outside the monorepo**, swap
those `workspace:*` entries to one of:

- `"@aotterclam/clam-cms-spec": "^<version>"` — once the SDK is published
  to npm; pick the version closest to the snapshot date.
- `"@aotterclam/clam-cms-spec": "file:<relative-path-to-checkout>"` —
  while iterating against a local SDK checkout.

```bash
# Inside-the-monorepo reuse (workspace:* keeps working):
cp -r starters/_archive/blog-editorial-2026-05-05 starters/blog-editorial
# Edit starters/blog-editorial/package.json `name` to a fresh value
# (e.g. @aotterclam/starter-blog-editorial).

# Outside-the-monorepo reuse (rewrite workspace:* deps):
cp -r starters/_archive/blog-editorial-2026-05-05 ~/my-editorial-blog
cd ~/my-editorial-blog
# Then hand-edit package.json to replace `workspace:*` with whatever
# resolution mode applies.
```

After moving, apply any SDK API migrations the changelog called out
since the snapshot date.

Snapshots are **read-only by convention**. Do not add commits that edit
snapshot directories — fork them out of the archive instead.
