import { canonicalizeLocaleList } from "../locale.js";
import type { SiteDefaults } from "./types.js";

/**
 * Synchronous fail-fast for `siteDefaults`. Throws
 * `InvalidSiteDefaultsError` when any declared locale fails BCP 47
 * canonicalization. Brand / title are not validated — only the locale
 * tags carry semantics that the runtime depends on.
 *
 * Lives in spec (not runtime) because it's pure validation against the
 * `SiteConfig` contract — no env, no DB. Runtime calls this at module
 * init (`bootSdk`) so a typo in `mantleConfig.ts > siteDefaults.locales`
 * surfaces in `wrangler tail` before the worker accepts traffic.
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

export function assertSiteDefaultsCanonical(
  defaults: SiteDefaults | undefined,
): void {
  if (!defaults?.locales || defaults.locales.length === 0) return;
  const { invalid } = canonicalizeLocaleList(defaults.locales);
  if (invalid.length > 0) throw new InvalidSiteDefaultsError(invalid);
}
