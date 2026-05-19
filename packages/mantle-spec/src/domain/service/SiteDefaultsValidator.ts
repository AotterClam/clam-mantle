import { MEDIA_PURPOSE_SLUG_PATTERN, type SiteDefaults } from "../model/SiteConfig.js";
import { canonicalizeLocaleList } from "./LocaleCanonicalizer.js";

/**
 * Synchronous fail-fast for `siteDefaults`. Throws
 * `InvalidSiteDefaultsError` when any declared locale fails BCP 47
 * canonicalization. Throws `InvalidMediaPurposesError` when any
 * declared `media.purposes` entry fails the slug pattern. Brand /
 * title / description / origin are not validated — only the fields
 * whose values carry semantics the runtime depends on.
 *
 * Lives in spec (not runtime) because it's pure validation against
 * the `SiteConfig` contract — no env, no DB. Runtime calls this at
 * module init (`bootInit`) so a typo in `clam.config.ts >
 * siteDefaults` surfaces in `wrangler tail` before the worker
 * accepts traffic.
 */
export class InvalidSiteDefaultsError extends Error {
  constructor(public readonly invalidLocales: ReadonlyArray<string>) {
    super(
      `Invalid BCP 47 locale tag(s) in CmsConfig.siteDefaults.locales: ` +
        invalidLocales.map((s) => `'${s}'`).join(", ") +
        `. Use BCP 47 form like 'en' or 'zh-TW' — the canonicalizer ` +
        `accepts mixed case ('zh-tw' / 'ZH_TW'), but the structure must ` +
        `be a 2/3-letter language plus optional 2-letter region. ` +
        `See ADR-0010 / cms-spec's canonicalizeLocaleList.`,
    );
    this.name = "InvalidSiteDefaultsError";
  }
}

export class InvalidMediaPurposesError extends Error {
  constructor(public readonly invalidPurposes: ReadonlyArray<string>) {
    super(
      `Invalid media purpose slug(s) in CmsConfig.siteDefaults.media.purposes: ` +
        invalidPurposes.map((s) => `'${s}'`).join(", ") +
        `. Each purpose must match ${MEDIA_PURPOSE_SLUG_PATTERN.source} — ` +
        `lowercase alphanumerics, dash-separated, no leading/trailing or ` +
        `repeated dashes. Examples: 'product-cover', 'post-cover', ` +
        `'product-gallery'. See AotterClam/mantle#262.`,
    );
    this.name = "InvalidMediaPurposesError";
  }
}

export function assertSiteDefaultsCanonical(
  defaults: SiteDefaults | undefined,
): void {
  if (defaults?.locales && defaults.locales.length > 0) {
    const { invalid } = canonicalizeLocaleList(defaults.locales);
    if (invalid.length > 0) throw new InvalidSiteDefaultsError(invalid);
  }
  const purposes = defaults?.media?.purposes;
  if (purposes && purposes.length > 0) {
    const invalid = purposes.filter((p) => !MEDIA_PURPOSE_SLUG_PATTERN.test(p));
    if (invalid.length > 0) throw new InvalidMediaPurposesError(invalid);
  }
}
