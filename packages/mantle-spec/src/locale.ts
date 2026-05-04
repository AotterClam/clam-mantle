/**
 * Locale normalization. Two forms in play:
 *
 *   - **Canonical** (BCP 47): language lowercase, region uppercase —
 *     e.g. `zh-TW`, `en-US`, `pt-BR`. Used in storage (D1 entries.locale,
 *     KV keys) and in HTML metadata (`<html lang>`, `<link hreflang>`,
 *     OG locale). This is the form the standard expects.
 *
 *   - **URL**: always lowercase — e.g. `zh-tw`. Used in public URL paths.
 *     Lowercase URLs are more forgiving when users hand-type, get
 *     auto-lowercased by chat clients / CDNs, etc.
 *
 * Single source of truth for BCP 47 shape across the SDK: manifest
 * parsing, `site_config.locales` writes, content-ops `data.locale`
 * validation, public router URL segments, boot-time site-config check.
 *
 * 2- or 3-letter ISO 639 language (covers `en`, `ja`, plus 3-letter
 * codes like `fil`, `haw`) + optional 2-letter ISO 3166 region. No
 * script subtag (`zh-Hant`), no variants (`de-1996`). Extend the
 * regexes below — they are the only place the restriction lives.
 *
 * Note: `URL_LOCALE` is stricter than `LANG` (2-letter only) because
 * 3-letter languages don't appear in published URL paths today. If
 * you accept a 3-letter site locale, audit URL_LOCALE consumers
 * before flipping it.
 */

const LANG = /^[a-z]{2,3}$/;
const REGION = /^[a-z]{2}$/;

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
 * a-z0-9 with hyphens, must start with alphanumeric. Same shape contract
 * as `URL_LOCALE`, consumers can plug it into route patterns
 * (`/:slug{${URL_SEGMENT.source}}`).
 */
export const URL_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

export class InvalidLocaleError extends Error {
  constructor(value: string) {
    super(`invalid locale: ${value}`);
    this.name = "InvalidLocaleError";
  }
}

/**
 * Accepts `zh-TW`, `zh-tw`, `zh_TW`, `zhTW`, `ZH-tw`, `en` etc. Returns
 * canonical BCP 47 form (`zh-TW`, `en`). Throws `InvalidLocaleError` for
 * anything that doesn't shape up.
 */
export function toCanonicalLocale(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new InvalidLocaleError(String(input));
  }
  // Split on `-` or `_`; if neither, allow `zhTW` style by inserting
  // the boundary at position 2 (most common 2+2 form).
  let parts = input.replace(/_/g, "-").split("-");
  const head = parts[0];
  if (head === undefined) throw new InvalidLocaleError(input);
  if (parts.length === 1 && head.length === 4) {
    parts = [head.slice(0, 2), head.slice(2)];
  }
  const lang = parts[0]!.toLowerCase();
  if (!LANG.test(lang)) throw new InvalidLocaleError(input);
  if (parts.length === 1) return lang;
  const region = parts[1]!.toLowerCase();
  if (!REGION.test(region)) throw new InvalidLocaleError(input);
  return `${lang}-${region.toUpperCase()}`;
}

/** Canonical → URL form (always lowercase). */
export function toUrlLocale(canonical: string): string {
  return canonical.toLowerCase();
}

/**
 * Parse a URL locale segment back to canonical. Stricter than
 * `toCanonicalLocale`: only accepts `xx` or `xx-yy` (lowercase only),
 * which is what the public router regex matches.
 */
export function fromUrlLocale(urlSegment: string): string {
  return toCanonicalLocale(urlSegment);
}

/**
 * Best-effort canonicalization. Unlike `toCanonicalLocale`, never
 * throws — returns the original input unchanged when it's malformed.
 * Used for query-side comparisons where a malformed filter value
 * should simply match nothing rather than error.
 */
export function safeCanonicalLocale(input: string): string {
  try {
    return toCanonicalLocale(input);
  } catch {
    return input;
  }
}

/**
 * Canonicalize an array of locale strings, separating valid from
 * invalid in one pass. The caller decides whether to reject (write
 * paths) or warn (read paths) on `invalid.length > 0`.
 *
 * Preserves input order in `valid`; canonicalizes each entry; dedupes
 * the result so `["zh-tw", "zh-TW"]` collapses to `["zh-TW"]`.
 */
export function canonicalizeLocaleList(
  inputs: ReadonlyArray<string>,
): { readonly valid: string[]; readonly invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of inputs) {
    try {
      const canonical = toCanonicalLocale(raw);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        valid.push(canonical);
      }
    } catch {
      invalid.push(raw);
    }
  }
  return { valid, invalid };
}
