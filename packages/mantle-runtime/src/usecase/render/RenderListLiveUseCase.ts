import type { SchemaManifest } from "@aotter/mantle-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import type { TemplateRegistry } from "../../domain/model/TemplateRegistry.js";
import { readPublishedEntries } from "../../domain/service/PublishedEntries.js";
import { joinParentForList } from "../../domain/service/JoinedEntryReader.js";
import { renderListHtml } from "../../domain/service/HtmlRenderer.js";
import type { RenderListLiveRequest } from "../dto/render/RenderListLiveRequest.js";

/**
 * Render a collection's list page from current DB state. Sibling to
 * `RenderEntryLiveUseCase` for the post-list / page-list surfaces.
 * Returns `null` when no list template is registered for the
 * collection — adapters map to 404.
 *
 * Each entry is run through the parent-join (ADR-0010) before being
 * passed to the list template, so list-item fields living on the
 * parent (e.g. `posts.coverUrl` for a translations-list) reach the
 * template the same way they do on the entry detail page.
 */
export class RenderListLiveUseCase {
  constructor(
    private readonly db: DatabaseDriver,
    private readonly templates: TemplateRegistry,
    private readonly schemas: ReadonlyMap<string, SchemaManifest>,
  ) {}

  async execute(request: RenderListLiveRequest): Promise<string | null> {
    const raw = await readPublishedEntries(this.db, {
      collection: request.collection,
      locale: request.locale,
    });
    const entries = await joinParentForList(this.db, this.schemas, raw, {
      parentStatus: "published",
    });
    return renderListHtml({
      collection: request.collection,
      locale: request.locale,
      entries,
      site: request.site,
      templates: this.templates,
    });
  }
}
