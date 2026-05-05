/**
 * L1 — design tokens. Light + dark CSS custom properties only. Every
 * other style rule (in `styles.ts`) is expressed in terms of these
 * vars, so swapping any single token cascades through the whole
 * theme.
 *
 * Override path for consumers: drop a `src/theme/tokens.ts` exporting
 * a `TOKENS_CSS` string. The override is concatenated AFTER this
 * file's tokens, so its later `:root { ... }` declarations win on
 * normal CSS specificity rules.
 *
 * Today these tokens encode the editorial baseline (warm cream paper,
 * vermillion accent, Fraunces serif). The neutralize pass replaces
 * them with a stylistically-inert default; pre-neutralize values are
 * preserved verbatim in starters/_archive/blog-editorial-2026-05-05/.
 */
export const TOKENS_CSS = `
:root {
  --paper: #f6f1e7;
  --ink: #1a1814;
  --rule: #d4c8b3;
  --rule-strong: #3d342a;
  --mute: #7a6d5e;
  --accent: #a3331f;
  --accent-soft: #c9614a;
  --selection: #f0d6a3;

  --font-display: "Fraunces", "Noto Serif TC", "Source Serif 4", Georgia, serif;
  --font-body: "Source Serif 4", "Noto Serif TC", Georgia, serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --measure: 38rem;
  --gutter: clamp(1.25rem, 4vw, 3rem);
}

[data-theme="dark"] {
  --paper: #1a1814;
  --ink: #f1ebdf;
  --rule: #3d342a;
  --rule-strong: #5a4d40;
  --mute: #9a8d7e;
  --accent: #e6594a;
  --accent-soft: #c9614a;
  --selection: #4a3520;
}
`;
