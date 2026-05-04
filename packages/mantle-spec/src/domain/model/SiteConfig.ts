/**
 * Site-level declarative contract — sibling to the manifest grammar,
 * not part of it.
 *
 * The 4-atom manifest grammar (Schema/View/Procedure/Trigger) describes
 * content types. `SiteConfig` describes deployment metadata: locales the
 * site publishes in, brand label, the operator-visible title and
 * description, the canonical absolute origin used for canonical URLs.
 *
 * Lives in `mantle-spec` (not `-runtime`) because the spec validator
 * checks declared `siteDefaults.locales` are canonical BCP 47 at boot
 * (see `domain/service/SiteDefaultsValidator`). The runtime operations
 * that read/write `site_config` rows from the DB live in
 * `mantle-runtime` — they go through the `DatabaseDriver`.
 *
 * Future v0.1.x: optional standalone `site.yaml` parsed via a
 * `kind: SiteConfig` envelope sibling to the 4-atom manifest grammar.
 * Today the consumer declares `siteDefaults` in `mantleConfig.ts` as a
 * TS object; either path conforms to this type.
 */
export interface SiteConfig {
  /** Site title — `<title>` suffix and og:site_name. */
  readonly title: string;
  /** Default `<meta name="description">` when an entry has none. */
  readonly description: string;
  /** Canonical absolute origin (no trailing slash), e.g. `https://my-blog.com`. */
  readonly origin: string;
  /** All locales the site publishes in. Empty = locale subsystem off
   *  site-wide (ADR-0010). Drives `<link rel="alternate" hreflang>`
   *  emission only when non-empty. */
  readonly locales: readonly string[];
  /** Canonical locale (`locales[0]`) or `null` when locales is empty.
   *  Templates emit `<html lang="">` only when this is non-null —
   *  silent omission is correct for zero-locale sites, not a fake
   *  default. */
  readonly canonicalLocale: string | null;
  /** Operator-facing brand label — admin chrome (sidebar header,
   *  sign-in card). Distinct from `title` so single-tenant operators
   *  can ship one and agencies can override the other. */
  readonly brand: string;
}

/**
 * First-deploy seed declared by the consumer in `mantleConfig.ts`. The
 * runtime applies via `INSERT … ON CONFLICT(key) DO NOTHING` — operator
 * edits via the admin Settings page are never overwritten on
 * subsequent deploys. Empty / blank fields skip, preventing a partial
 * seed from clobbering rows the operator already set.
 *
 * Validated synchronously at module-init by
 * `assertSiteDefaultsCanonical`; a non-canonical locale tag fails fast
 * in `wrangler tail` rather than corrupting the seed.
 *
 * `SiteDefaults` is the **author-time** declaration (what the consumer
 * writes); `SiteConfig` (above) is the **runtime read shape**
 * (what the dispatcher and templates see after the seed has been
 * applied and the operator has had a chance to edit). The conversion
 * happens in `mantle-runtime` via `loadSiteConfig(env)` — spec
 * defines both types and the validator, runtime owns the read/write.
 */
export interface SiteDefaults {
  readonly locales?: ReadonlyArray<string>;
  readonly brand?: string;
  readonly title?: string;
  /** Default `<meta name="description">` and og:description for entries
   *  that don't carry their own. */
  readonly description?: string;
  /** Canonical absolute origin (no trailing slash), e.g.
   *  `https://my-blog.com`. The render pipeline uses this to build
   *  absolute URLs in `/llms.txt` and the `.md` mirrors; an empty
   *  origin produces relative URLs that are useless to off-site agent
   *  consumers. Seed it from `mantleConfig.ts` so a fresh deploy gets
   *  correct URLs without an admin-UI round trip. */
  readonly origin?: string;
}
