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
 * Today the consumer declares `siteDefaults` in `clam.config.ts` as a
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
  /** Absolute or root-relative favicon URL. Omit to use the SDK's
   *  default AotterClam mark at `/favicon.svg`. */
  readonly faviconUrl?: string;
  /** Starter-declared media taxonomy. Empty array = no first-party
   *  media uploads permitted; the runtime disables the
   *  `create_media_upload` / `commit_media_upload` MCP tools and the
   *  admin upload lifecycle on deployments that don't declare any
   *  purpose, symmetric with "no `MediaStorage` configured". When
   *  non-empty, `create_media_upload` rejects any `purpose` not in
   *  this set with `MEDIA_PURPOSE_REJECTED`. */
  readonly media: SiteMediaConfig;
}

/** Runtime read shape for the `media` section of `SiteConfig`. Always
 *  present after seed; `purposes` may be empty when the consumer
 *  didn't declare any. Per-field `x-clam-media` (manifest extension)
 *  is intentionally out of scope for v0.1 — see #262. */
export interface SiteMediaConfig {
  readonly purposes: readonly string[];
}

/**
 * First-deploy seed declared by the consumer in `clam.config.ts`. The
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
   *  consumers. Seed it from `clam.config.ts` so a fresh deploy gets
   *  correct URLs without an admin-UI round trip. */
  readonly origin?: string;
  /** Absolute or root-relative favicon URL. */
  readonly faviconUrl?: string;
  /** Starter-declared media taxonomy. See `SiteConfig.media` for
   *  runtime semantics. Omit the whole `media` key (or declare it
   *  with an empty `purposes` array) on archetypes that don't
   *  exercise first-party media uploads — the runtime will keep the
   *  upload tools disabled, symmetric with "no `MediaStorage`
   *  configured". Slug-shaped (`^[a-z0-9]+(-[a-z0-9]+)*$`); validated
   *  synchronously at boot. */
  readonly media?: SiteMediaDefaults;
}

export interface SiteMediaDefaults {
  readonly purposes?: ReadonlyArray<string>;
}

/** Slug regex for `media.purposes` entries. Matches a lowercase
 *  alphanumeric word, optionally followed by dash-separated
 *  alphanumeric segments — no leading/trailing dashes, no double
 *  dashes. The R2 adapter already uses a looser variant of this for
 *  storage-key prefixes (`/^[a-z0-9-]+$/`); spec-level validation is
 *  stricter so admin / docs / object-store dashboards see clean
 *  slugs. */
export const MEDIA_PURPOSE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
