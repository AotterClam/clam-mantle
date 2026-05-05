---
name: mantle customize-design
description: Layer custom design over starters/blog using the L1–L4 theme stack (tokens / extraCss+icons+i18n / Header+Footer slots / whole-template fork). Use when the user wants to rebrand, restyle, or swap UI pieces without forking the whole starter.
when_to_invoke: |
  Indicators in user prompts: "change the colors", "use my own font", "I want a different header", "make this look like X", "this is too plain / too editorial", "translate the labels", "swap the logo". Applies to starters/blog only — starters/blank has no UI to customize.
applies_to: mantle@v0.1.0 + starters/blog
---

# Customize the design of a mantle blog

You are layering a consumer theme over `starters/blog/`. The baseline lives at `src/theme.default/` (read-only by convention). Consumer overrides live at `src/theme/`. Always escalate from L1 → L4 and stop at the lowest layer that solves the user's stated need.

## Layer cheatsheet

| Layer | Where | Use for |
|---|---|---|
| **L1** tokens | `src/theme/tokens.ts` | palette, font stack, type scale, measure, gutter |
| **L2** extraCss | `src/theme/index.ts:extraCss` | extra CSS rules (border-radius, hero size, etc.) |
| **L2** icons | `src/theme/icons.ts` | replace baseline icons by name; add new ones |
| **L2** i18n | `src/theme/i18n/<locale>.json` | retitle UI strings per locale (deep-merge) |
| **L3** components | `src/theme/components/{Header,Footer}.tsx` | replace chrome wholesale |
| **L4** templates | `src/theme/templates/<name>.tsx` | replace a page kind end-to-end |

## Conversation pattern

1. **Map the user's intent to a layer.** "Change the colors" → L1. "Different header structure" → L3. Tell the user the layer + the escape hatch ("I'll start at L1 since you want a different palette; if that doesn't get close enough, we can escalate to a custom Header at L3").
2. **Fork → edit → review.** Run `pnpm theme:fork <path>`, edit the new file in `src/theme/`, ask the user to reload `pnpm dev`.
3. **On dissatisfaction, either iterate or revert.** `pnpm theme:reset <path>` removes the override and restores the baseline. The user can roll back any single layer without affecting others.

## Layer recipes

### L1 — tokens

```bash
pnpm theme:fork tokens.ts
```

Edit `src/theme/tokens.ts`:

```ts
export const TOKENS_CSS = `
:root {
  --paper: #fffbf3;
  --ink: #1a1814;
  --accent: #a3331f;
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Source Serif 4", Georgia, serif;
  --measure: 36rem;
}
[data-theme="dark"] {
  --paper: #1a1814;
  --ink: #f1ebdf;
  --accent: #e6594a;
}
`;
```

The override is concatenated AFTER baseline tokens, so later declarations win on standard CSS specificity. You only need to redeclare the vars you want to change.

**Custom web fonts**: if your `--font-display` references a font not in the system stack, register it with L2 `extraCss` using `@font-face`. Do **not** use CSS `@import` here: `extraCss` is appended after baseline rules, and browsers ignore late `@import` statements.

```ts
const overrides: ThemeOverride = {
  extraCss: `
    @font-face {
      font-family: "FrauncesLocal";
      src: url("/fonts/fraunces.woff2") format("woff2");
      font-weight: 400 700;
      font-display: swap;
    }
  `,
  tokens: `:root { --font-display: "FrauncesLocal", Georgia, serif; }`,
};
```

`Layout` is intentionally NOT a customization slot — `Theme.ts` only allows Header / Footer overrides. Forking `components/Layout.tsx` would copy the file but the override has nowhere to register. If you need to change `<head>` content beyond what tokens / extraCss can express, the path is L4 fork on every template (each takes responsibility for its own envelope), or pick another starter.

Revert: `pnpm theme:reset tokens.ts`.

### L2 — extraCss

Edit `src/theme/index.ts` — set the `extraCss` field directly (no fork needed, this is just a string):

```ts
const overrides: ThemeOverride = {
  extraCss: `
    .site-main { max-width: 64rem; }
    .post-cover { border-radius: 8px; }
    blockquote { background: var(--rule); padding: 1rem; }
  `,
};
```

Revert: clear the field.

### L2 — icons

```bash
pnpm theme:fork icons.ts
```

Edit `src/theme/icons.ts`:

```ts
const customIcons: Record<string, string> = {
  // override an existing baseline icon
  globe: '<circle cx="12" cy="12" r="9"/><path d="..."/>',
  // add a new icon
  logo: '<path d="M12 2L2 7v10l10 5 10-5V7l-10-5z"/>',
};
export default customIcons;
```

Use in any template via the SDK's `icon()` resolver: `icon("logo", { size: 24 })`. SVG path content only — no `<svg>` wrapper. The fork ships a stub (not a copy of the baseline), since you're extending a registry, not replacing a function.

Revert: `pnpm theme:reset icons.ts`.

### L2 — i18n

```bash
pnpm theme:fork i18n/en.json
```

Edit `src/theme/i18n/en.json` — partial bundle, deep-merged over baseline:

```json
{
  "header": { "posts": "Articles" },
  "home": { "eyebrow": "the dispatch" },
  "notFound": { "title": "Lost at sea" }
}
```

Other keys carry forward from baseline. To support a new locale (`ja`, `de`, etc.), edit `src/i18n/<locale>.json` directly — i18n locale set is consumer-level, not a theme slot.

Revert: `pnpm theme:reset i18n/en.json`.

### L3 — Header / Footer

```bash
pnpm theme:fork components/Header.tsx
pnpm theme:fork components/Footer.tsx
```

Only `Header` and `Footer` are supported component slots — `theme:fork components/Layout.tsx` (or any other component name) fails fast with a clear error. Edit `src/theme/components/Header.tsx`. Key contracts:

- Don't change the props signature: `Header(props: HeaderProps)`.
- `props.site.brand`, `props.site.locales`, `props.locale`, `props.current` are available.
- Baseline siblings (icon registry, etc.) auto-rewritten on fork to `../../theme.default/<path>`. Keep those unless you want to drop the baseline icon set.

Same shape for `Footer`.

Revert: `pnpm theme:reset components/Header.tsx`.

### L4 — whole template (escape hatch)

```bash
pnpm theme:fork templates/post.tsx
```

Edit `src/theme/templates/post.tsx`. The forked file imports baseline Layout via `../../theme.default/components/Layout.js`. If you also forked Layout (rare — only if you also went L3 on every template), manually rewrite that import to your version.

L4 is the last resort. If the user wants more than two L4 forks, suggest the conversation: "The shape you're describing isn't really a blog any more — would you like a docs site (`starters/docs`, v0.2) instead?"

Revert: `pnpm theme:reset templates/post.tsx`.

## Hard rules

- Don't edit `src/theme.default/`. Use fork.
- Don't add new top-level keys to `ThemeOverride` — extend through the six existing slots.
- `Layout` is locked — change envelope shape via L4 forks (every template) or pick another starter.
- After a fork, the file is a normal `.ts` / `.tsx` / `.json` — TS errors will surface on `pnpm typecheck` as usual; resolve them like any code change.

## Diagnostic recipes

| Symptom | Cause | Fix |
|---|---|---|
| `pnpm theme:fork X` exits with "Override already exists" | Already forked | `pnpm theme:reset X` first |
| `pnpm typecheck` fails in `src/theme/components/<Name>.tsx` after fork | A baseline import didn't auto-rewrite (rare; check `theme-fork.mjs`) | Manually change `from "../<sibling>"` to `from "../../theme.default/<sibling>"` |
| Color change not visible after edit | Browser CSS cache | Hard reload (Cmd+Shift+R / Ctrl+F5); if persists, restart `pnpm dev` |
| Forked `en.json` discards keys I didn't redeclare | Bundle isn't deep-merging | Verify `src/i18n/index.ts:deepMerge` — should be present (PR #5). If missing, the SDK shipped wrong; open an issue. |
| Fork's `theme/index.ts` entry has wrong key shape | Old fork-script before PR #5 | Update to latest starter, re-fork. |

## When you're done

Tell the user three things:

1. **Layer landed at** — "I made the change at L1 (tokens) — palette only, no structural edits."
2. **Revert command** — "If you don't like it, `pnpm theme:reset tokens.ts` rolls it back."
3. **Next escalation step** — "If the colors aren't enough, the next layer would be L3 — replace the Header component."

Stop after one layer per turn unless the user explicitly says "go deeper". The point of layering is to keep each customization step reversible and inspectable.
