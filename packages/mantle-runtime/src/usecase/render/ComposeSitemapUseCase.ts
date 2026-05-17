import type { Entry } from "@aotter/mantle-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import { readPublishedEntries } from "../../domain/service/io/PublishedEntries.js";
import { entryPublicPath } from "../../domain/service/PublishKeys.js";
import { serializeSitemap } from "../../domain/service/SitemapSerializer.js";
import type { ComposeSitemapRequest } from "../dto/render/ComposeSitemapRequest.js";

/**
 * Compose `sitemap.xml` from every published entry across all
 * collections + locales. Result is XML text; consumer routes it as
 * `application/xml`. See ComposeSitemapRequest for the pathFor +
 * maxUrls knobs.
 */
export const SITEMAP_MAX_URLS_DEFAULT = 50000;

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
