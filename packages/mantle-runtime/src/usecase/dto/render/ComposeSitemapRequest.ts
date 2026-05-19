import type { Entry, SiteConfig } from "@aotter/mantle-spec";

export interface ComposeSitemapRequest {
  readonly site: SiteConfig;
  /** Map storage row → public route. Returning `null` skips. */
  readonly pathFor?: (entry: Entry) => string | null;
  /** Caps the SQL read + memory cost. Defaults to
   *  SITEMAP_MAX_URLS_DEFAULT (50,000 — the sitemap-protocol per-file
   *  ceiling). */
  readonly maxUrls?: number;
}
