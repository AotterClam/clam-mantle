import type { Entry, SiteConfig } from "@aotter/mantle-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import { readPublishedEntries } from "../../domain/service/PublishedEntries.js";
import { entryPublicPath } from "../../domain/service/PublishKeys.js";
import { serializeSitemap } from "../../domain/service/SitemapSerializer.js";

/**
 * Compose `sitemap.xml` from every published entry across all
 * collections + locales. Result is XML text; consumer routes it as
 * `application/xml`.
 *
 * `pathFor` lets the consumer map (collection, slug, locale) to its
 * routing shape — e.g. `post-translations` storage rows surface as
 * `/{locale}/posts/{slug}` in the starter. Returning `null` skips
 * an entry. The default uses `entryPublicPath` (the storage shape)
 * which is rarely what a public sitemap wants; consumers should pass
 * a mapper.
 */
export interface ComposeSitemapRequest {
  readonly site: SiteConfig;
  readonly pathFor?: (entry: Entry) => string | null;
}

export class ComposeSitemapUseCase {
  constructor(private readonly db: DatabaseDriver) {}

  async execute(request: ComposeSitemapRequest): Promise<string> {
    const all = await readPublishedEntries(this.db);
    const mapper = request.pathFor ?? entryPublicPath;
    const entries = all.flatMap((e) => {
      const path = mapper(e);
      return path === null ? [] : [{ entry: e, path }];
    });
    return serializeSitemap({ site: request.site, entries });
  }
}
