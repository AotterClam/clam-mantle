# `theme/` — your override surface

This directory is yours. The baseline lives in `../theme.default/` and
ships locked with the starter. To customize anything visual, drop
files here and uncomment the matching entry in `index.ts`.

## How layering works

The starter merges `theme.default/` and your `theme/` exports at
module init:

| What | Default in `theme.default/` | Override mechanic |
|---|---|---|
| Design tokens | `tokens.ts` (`:root` + `[data-theme="dark"]` CSS vars) | Append your CSS in `theme/index.ts:tokens` — later declarations win |
| Stylesheet rules | `styles.ts` | Append your CSS in `theme/index.ts:extraCss` |
| Icons | `icons.ts` (8 lucide-style SVG paths) | Spread your map over baseline in `theme/index.ts:icons` (same name → override; new name → addition) |
| i18n strings | `../i18n/{en,zh-TW}.json` | Deep-merge a partial bundle in `theme/index.ts:i18n` |
| Header / Footer chrome | `components/{Header,Footer}.tsx` | Replace whole component in `theme/index.ts:components` |
| Page templates | `templates/{post,postList,page,home,contact,notFound}.tsx` | Replace render function in `theme/index.ts:templates` |

`Layout.tsx` is intentionally NOT a slot — changing the whole page
envelope means picking a different starter. Override Header and
Footer for chrome variations within the same envelope.

## Recommended escalation

Walk the layers low to high; stop as soon as one solves the user
need:

1. **L1 tokens** — change colors, fonts, spacing. 90% of rebrand
   work fits here. Edit `theme/tokens.ts` (after `pnpm theme:fork
   tokens.ts`).
2. **L2 atomic** — extra rules / icons / strings without
   restructuring the chrome. Add CSS via `theme/index.ts:extraCss`
   (a string field — no separate `extra.css` file); fork
   `theme/icons.ts` / `theme/i18n/<locale>.json` for those.
3. **L3 component** — replace the Header or Footer wholesale.
4. **L4 template** — replace a whole page kind. Last resort; means
   the consumer owns that page's structure going forward.

## Forking files

```bash
pnpm theme:fork components/Header.tsx
# - copies src/theme.default/components/Header.tsx → src/theme/components/Header.tsx
# - uncomments the matching `Header: ...` line in theme/index.ts

pnpm theme:reset components/Header.tsx
# - removes src/theme/components/Header.tsx
# - re-comments the line in theme/index.ts
```

The npm scripts live in this starter's `package.json`; they only know about
this starter's convention (theme.default/ + theme/) and don't reach
into the SDK CLI.

## What stays baseline (don't override)

- Layout shape (single column with sticky header → main → footer)
- Popover plumbing (theme + lang switchers wire-up)
- Theme-bootstrap inline script (FOUC prevention)
- Header runtime JS (popover / theme persistence)

If you need to change any of these, fork the whole template that
uses them, or pick a different starter shape.
