import en from "./en.json";
import zhTw from "./zh-TW.json";

/**
 * Single source of truth for every UI string the templates render.
 * Schema-stored content (post bodies, page bodies, post titles) stays
 * in the runtime; this is starter chrome (nav, headings, error copy,
 * form labels) that doesn't fit a CMS-row shape.
 *
 * Adding a fourth locale (e.g. `ja`):
 *   1. Create `./ja.json` mirroring the en/zh-TW shape (TypeScript
 *      will complain on shape divergence — every locale must satisfy
 *      `I18nBundle`).
 *   2. Import + register here.
 *   3. Add `"ja"` to `siteDefaults.locales` in `src/clamConfig.ts`.
 *   4. Add Schema entries (post-translations / page-translations) for
 *      that locale via fixture or admin.
 *
 * `bundleFor(locale)` falls back to `en` when a locale isn't
 * registered — same pattern the runtime uses for missing
 * post-translations.
 */
export type I18nBundle = typeof en;

export const I18N_BUNDLES: Readonly<Record<string, I18nBundle>> = {
  en,
  "zh-tw": zhTw,
};

export function bundleFor(locale: string): I18nBundle {
  return I18N_BUNDLES[locale.toLowerCase()] ?? en;
}

export function localeLabel(locale: string): string {
  return bundleFor(locale).label;
}
