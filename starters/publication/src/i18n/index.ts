import en from "./en.json";
import zhTw from "./zh-TW.json";
import overrides from "../theme/index.js";

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
 *   2. Import + register in `BASELINE_BUNDLES` below.
 *   3. Add `"ja"` to `siteDefaults.locales` in `src/clamConfig.ts`.
 *   4. Add Schema entries (post-translations / page-translations) for
 *      that locale via fixture or admin.
 *
 * `theme/index.ts:i18n.<locale>` is deep-merged OVER the baseline
 * bundle for that locale, so a consumer can retitle a single string
 * without forking the whole JSON.
 *
 * `bundleFor(locale)` falls back to `en` when a locale isn't
 * registered — same pattern the runtime uses for missing
 * post-translations.
 */
export type I18nBundle = typeof en;

function deepMerge<T>(base: T, override: unknown): T {
  if (override == null || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }
  if (base == null || typeof base !== "object" || Array.isArray(base)) {
    return override as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  }
  return out as T;
}

const enMerged = deepMerge(en, overrides.i18n?.en);
const zhTwMerged = deepMerge(zhTw, overrides.i18n?.["zh-tw"]);

export const I18N_BUNDLES: Readonly<Record<string, I18nBundle>> = {
  en: enMerged,
  "zh-tw": zhTwMerged,
};

export function bundleFor(locale: string): I18nBundle {
  return I18N_BUNDLES[locale.toLowerCase()] ?? enMerged;
}

export function localeLabel(locale: string): string {
  return bundleFor(locale).label;
}
