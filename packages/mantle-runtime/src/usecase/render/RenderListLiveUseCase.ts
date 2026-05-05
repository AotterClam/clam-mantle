import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import type { TemplateRegistry } from "../../domain/model/TemplateRegistry.js";
import { readPublishedEntries } from "../../domain/service/PublishedEntries.js";
import { renderListHtml } from "../../domain/service/HtmlRenderer.js";
import type { RenderListLiveRequest } from "../dto/render/RenderListLiveRequest.js";

/**
 * Render a collection's list page from current DB state. Sibling to
 * `RenderEntryLiveUseCase` for the post-list / page-list surfaces.
 * Returns `null` when no list template is registered for the
 * collection — adapters map to 404.
 */
export class RenderListLiveUseCase {
  constructor(
    private readonly db: DatabaseDriver,
    private readonly templates: TemplateRegistry,
  ) {}

  async execute(request: RenderListLiveRequest): Promise<string | null> {
    const entries = await readPublishedEntries(this.db, {
      collection: request.collection,
      locale: request.locale,
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
