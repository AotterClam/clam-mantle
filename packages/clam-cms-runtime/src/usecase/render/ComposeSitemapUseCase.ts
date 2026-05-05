import type { Entry, SiteConfig } from "@aotterclam/clam-cms-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import { readPublishedEntries } from "../../domain/service/PublishedEntries.js";
import { entryPublicPath } from "../../domain/service/PublishKeys.js";
import { serializeSitemap } from "../../domain/service/SitemapSerializer.js";

/**
 * Compose `sitemap.xml` from every published entry across all
 * collections + locales. Result is XML text; consumer routes it as
 * `application/xml`.
 *
 * `pathFor` maps (collection, slug, locale) to the consumer's
 * routing shape — e.g. `post-translations` storage rows surface as
 * `/{locale}/posts/{slug}` in the starter. Returning `null` skips
 * an entry. The default uses `entryPublicPath` (the storage shape)
 * which is rarely what a public sitemap wants; consumers should pass
 * a mapper.
 *
 * `maxUrls` caps the row count to bound D1 read + memory cost on
 * sites with very large content sets. Defaults to 50_000 (the
 * sitemap-protocol per-file ceiling). For larger sites, split into
 * a sitemap index (v0.1.x) — until then, the cap protects against
 * unbounded scans on a 5-min cache miss.
 */
export const SITEMAP_MAX_URLS_DEFAULT = 50000;

export interface ComposeSitemapRequest {
  readonly site: SiteConfig;
  readonly pathFor?: (entry: Entry) => string | null;
  readonly maxUrls?: number;
}

export class ComposeSitemapUseCase {
  constructor(private readonly db: DatabaseDriver) {}

  async execute(request: ComposeSitemapRequest): Promise<string> {
    const cap = request.maxUrls ?? SITEMAP_MAX_URLS_DEFAULT;
    const all = await readPublishedEntries(this.db, { limit: cap });
    const mapper = request.pathFor ?? entryPublicPath;
    const entries: { entry: Entry; path: string }[] = [];
    for (const e of all) {
      const path = mapper(e);
      if (path !== null) entries.push({ entry: e, path });
    }
    return serializeSitemap({ site: request.site, entries });
  }
}
