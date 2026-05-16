/**
 * Locale shape constants + the typed parse error.
 *
 * Two forms in play:
 *
 *   - **Canonical** (BCP 47): language lowercase, region uppercase —
 *     e.g. `zh-TW`, `en-US`, `pt-BR`. Used in storage (entries.locale,
 *     KV keys) and HTML metadata (`<html lang>`, `<link hreflang>`,
 *     OG locale). This is the form the standard expects.
 *
 *   - **URL**: always lowercase — e.g. `zh-tw`. Used in public URL
 *     paths. Lowercase URLs are more forgiving when users hand-type,
 *     get auto-lowercased by chat clients / CDNs, etc.
 *
 * The conversion functions live in `domain/service/LocaleCanonicalizer`;
 * this file holds the pure shape (regex constants + error class) so
 * model-layer types can reference them without depending on services.
 */

/**
 * URL-form regex: lowercase BCP 47 (`xx` or `xx-yy`). Matches what a
 * public-content router should accept verbatim — strict canonical URL
 * form, no mixed case. Consumer routers can plug this into framework
 * route patterns directly (e.g. Hono's `/:locale{${URL_LOCALE.source}}/`).
 */
export const URL_LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/;

/**
 * Same shape, case-insensitive. Used to detect mixed-case locales that
 * a router should 301-redirect to lowercase rather than 400 — old
 * shared links like `/ZH-TW/posts/foo` keep working.
 */
export const LOCALE_SHAPED_SEGMENT = /^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/;

/**
 * URL slug regex shared by collection and entry-slug params: lowercase
 * a-z0-9 with hyphens, must start with alphanumeric.
 */
export const URL_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

export class InvalidLocaleError extends Error {
  constructor(value: string) {
    super(`invalid locale: ${value}`);
    this.name = "InvalidLocaleError";
  }
}
