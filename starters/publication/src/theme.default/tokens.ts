/**
 * L1 — design tokens. Light + dark CSS custom properties only. Every
 * style rule in `styles.ts` references these, so swapping any token
 * cascades through the whole theme. Override via
 * `theme/index.ts:tokens`; concatenated AFTER baseline so later
 * declarations win on standard CSS specificity.
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
