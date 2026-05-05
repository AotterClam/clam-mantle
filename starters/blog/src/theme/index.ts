import type { ThemeOverride } from "../Theme.js";

// Uncomment imports as you fork files into this directory.
// `pnpm theme:fork <relative-path>` does the cp + uncomment in one step.
//
// import HeaderOverride from "./components/Header.js";
// import FooterOverride from "./components/Footer.js";
// import postOverride from "./templates/post.js";
// import enOverride from "./i18n/en.json";
// import zhTwOverride from "./i18n/zh-TW.json";

/**
 * Consumer override surface. Edit to layer custom theme pieces over
 * `theme.default/`. Empty by default — the starter runs entirely on
 * the baseline.
 *
 * Override layering (low → high effort):
 *
 *   L1  tokens      — palette / typography / spacing CSS vars
 *   L2  extraCss    — extra rules
 *   L2  icons       — SVG path overrides + additions
 *   L2  i18n        — partial bundle merged over baseline
 *   L3  components  — Header / Footer chrome
 *   L4  templates   — whole-page render function replacement
 *
 * For a worked walkthrough: `skills/customize-design/SKILL.md`.
 */
const overrides: ThemeOverride = {
  // extraCss: `.site-main { max-width: 64rem; }`,
};

export default overrides;
