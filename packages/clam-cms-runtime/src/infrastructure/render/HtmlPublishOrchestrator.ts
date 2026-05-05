import {
  DiagnosticError,
  runtimeDiagnostic,
  type Entry,
  type SiteConfig,
} from "@aotterclam/clam-cms-spec";
import type { TemplateRegistry } from "../../domain/model/TemplateRegistry.js";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import type { KvCache } from "../../domain/port/KvCache.js";
import type {
  PublishEntryRequest,
  PublishOrchestrator,
} from "../../domain/port/PublishOrchestrator.js";
import {
  entryHtmlKey,
  entryMarkdownKey,
  listHtmlKey,
  llmsTxtKey,
} from "../../domain/service/PublishKeys.js";
import {
  readEntryById,
  readPublishedEntries,
} from "../../domain/service/PublishedEntries.js";
import { serializeEntryAsMarkdown } from "../../domain/service/MarkdownSerializer.js";
import {
  renderEntryHtml,
  renderListHtml,
} from "../../domain/service/HtmlRenderer.js";
import { ComposeLlmsTxtUseCase } from "../../usecase/render/ComposeLlmsTxtUseCase.js";

/**
 * `HtmlPublishOrchestrator` — the publish pipeline. Renders + writes
 * to `KvCache`:
 *   1. Entry HTML (if a template is registered for the collection)
 *   2. Entry `.md` mirror (if the entry has a `content` field)
 *   3. Collection list HTML for the entry's locale
 *   4. `/llms.txt` for the entry's locale (composed by ComposeLlmsTxtUseCase)
 *
 * Idempotent — invoking twice with the same entry id is safe; KV
 * writes overwrite. Non-localized entries publish under empty-string
 * locale.
 */
const DEFAULT_DOCTYPE = "<!DOCTYPE html>\n";

export class HtmlPublishOrchestrator implements PublishOrchestrator {
  private readonly composeLlmsTxt: ComposeLlmsTxtUseCase;

  constructor(
    private readonly db: DatabaseDriver,
    private readonly kv: KvCache,
  ) {
    this.composeLlmsTxt = new ComposeLlmsTxtUseCase(db);
  }

  async publish(request: PublishEntryRequest): Promise<void> {
    const entry = await readEntryById(this.db, request.entryId);
    if (!entry) {
      throw new DiagnosticError(
        runtimeDiagnostic({
          code: "NOT_FOUND",
          severity: "error",
          path: `usecase/PublishEntry/${request.entryId}`,
          value: request.entryId,
          expected: "id of an existing entry",
          message: `Entry not found: ${request.entryId}.`,
        }),
      );
    }
    const indexLocale = entry.locale ?? null;
    const doctype = request.htmlDoctype ?? DEFAULT_DOCTYPE;

    await Promise.all([
      this.renderEntry(entry, request.site, request.templates, doctype),
      this.renderList(entry.collection, indexLocale, request.site, request.templates, doctype),
      this.renderLlmsTxt(indexLocale, request.site),
    ]);
  }

  private async renderEntry(
    entry: Entry,
    site: SiteConfig,
    templates: TemplateRegistry,
    doctype: string,
  ): Promise<void> {
    const html = renderEntryHtml({ entry, site, templates, doctype });
    if (html !== null) {
      await this.kv.put(entryHtmlKey(entry), html);
    }
    const md = serializeEntryAsMarkdown(entry);
    if (md) {
      await this.kv.put(entryMarkdownKey(entry), md);
    }
  }

  private async renderList(
    collection: string,
    locale: string | null,
    site: SiteConfig,
    templates: TemplateRegistry,
    doctype: string,
  ): Promise<void> {
    const entries = await readPublishedEntries(this.db, { locale, collection });
    const html = renderListHtml({
      collection,
      locale: locale ?? "",
      entries,
      site,
      templates,
      doctype,
    });
    if (html !== null) {
      await this.kv.put(listHtmlKey(collection, locale ?? ""), html);
    }
  }

  private async renderLlmsTxt(locale: string | null, site: SiteConfig): Promise<void> {
    const body = await this.composeLlmsTxt.execute({ site, locale });
    await this.kv.put(llmsTxtKey(locale ?? ""), body);
  }
}

