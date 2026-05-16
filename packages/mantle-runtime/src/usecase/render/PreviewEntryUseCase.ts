import type { ContentState, Entry, SchemaManifest } from "@aotterclam/mantle-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import type { TemplateRegistry } from "../../domain/model/TemplateRegistry.js";
import type { PublicPathResolver } from "../../domain/service/PublicPathResolver.js";
import { readEntryBySlug } from "../../domain/service/PublishedEntries.js";
import { joinParentIfTranslation } from "../../domain/service/JoinedEntryReader.js";
import { renderEntryHtml } from "../../domain/service/HtmlRenderer.js";
import { injectPreviewBanner } from "../../domain/service/PreviewBanner.js";
import type { PreviewEntryRequest } from "../dto/render/PreviewEntryRequest.js";
import {
  composeSeoIfPathed,
  type SeoComposer,
} from "./EntrySeoSupport.js";

/** Default fallback: prefer drafts, fall back to published, then
 *  archived. Authors typically open `?preview=1` to see WIP. */
const DEFAULT_PREVIEW_STATUS_ORDER: ReadonlyArray<ContentState> = [
  "draft",
  "published",
  "archived",
];

/**
 * Render an entry with a preview banner. Walks `statusOrder` until a
 * matching row is found, renders via the registered template, then
 * injects the banner just inside `<body>`. Returns `null` when no
 * matching row exists or no template is registered.
 *
 * Composes SEO/AEO meta when the runtime was built with a
 * `publicPathResolver` — preview pages match the meta the published
 * version would carry, so authors see real shape during review.
 */
export class PreviewEntryUseCase {
  constructor(
    private readonly db: DatabaseDriver,
    private readonly templates: TemplateRegistry,
    private readonly paths: PublicPathResolver | null,
    private readonly composeSeo: SeoComposer,
    private readonly schemas: ReadonlyMap<string, SchemaManifest>,
  ) {}

  async execute(request: PreviewEntryRequest): Promise<string | null> {
    const order = request.statusOrder ?? DEFAULT_PREVIEW_STATUS_ORDER;
    let raw: Entry | null = null;
    for (const status of order) {
      raw = await readEntryBySlug(this.db, {
        collection: request.collection,
        slug: request.slug,
        locale: request.locale,
        status,
      });
      if (raw) break;
    }
    if (!raw) return null;
    // Preview can show drafts; parent lookup intentionally omits status
    // filter so a draft translation can still preview against its
    // already-published parent. RequestPublishUseCase enforces the
    // published-parent invariant at publish time.
    const entry = await joinParentIfTranslation(this.db, this.schemas, raw);
    const seo = await composeSeoIfPathed(this.composeSeo, this.paths, entry, request.site);
    const html = renderEntryHtml({
      entry,
      site: request.site,
      templates: this.templates,
      seo,
    });
    if (html === null) return null;
    const banner =
      request.banner ??
      `<div class="preview-banner">Preview · ${entry.status} · ${request.slug}</div>`;
    return injectPreviewBanner(html, banner);
  }
}
