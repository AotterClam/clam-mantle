/**
 * L1 — design tokens. Light + dark CSS custom properties only. Every
 * other style rule (in `styles.ts`) is expressed in terms of these
 * vars, so swapping any single token cascades through the whole
 * theme.
 *
 * Override path for consumers: drop a `src/theme/index.ts:tokens`
 * string. The override is concatenated AFTER this baseline, so its
 * later `:root { ... }` declarations win on normal CSS specificity
 * rules.
 *
 * The baseline is intentionally stylistically inert — neutral
 * grayscale + a single blue accent + system font stack — to give CC
 * and the human a low-opinion starting point. The pre-neutralize
 * editorial values (Fraunces / Source Serif 4 / 朱砂 vermillion /
 * cream paper) are preserved verbatim in
 * `starters/_archive/blog-editorial-2026-05-05/` for reuse.
 */
export const TOKENS_CSS = `
:root {
  --paper: #ffffff;
  --ink: #1a1a1a;
  --rule: #e5e5e5;
  --rule-strong: #c0c0c0;
  --mute: #6b6b6b;
  --accent: #2563eb;
  --accent-soft: #60a5fa;
  --selection: rgba(37, 99, 235, 0.18);

  --font-display: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Consolas, "Liberation Mono", monospace;

  --measure: 38rem;
  --gutter: clamp(1.25rem, 4vw, 3rem);
}

[data-theme="dark"] {
  --paper: #0f0f0f;
  --ink: #ededed;
  --rule: #2a2a2a;
  --rule-strong: #444444;
  --mute: #9b9b9b;
  --accent: #60a5fa;
  --accent-soft: #93c5fd;
  --selection: rgba(96, 165, 250, 0.22);
}
`;
