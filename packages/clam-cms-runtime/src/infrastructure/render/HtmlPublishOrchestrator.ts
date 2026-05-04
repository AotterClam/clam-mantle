import {
  DiagnosticError,
  runtimeDiagnostic,
  type ContentState,
  type Entry,
  type SiteConfig,
} from "@aotterclam/clam-cms-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import type { KvCache } from "../../domain/port/KvCache.js";
import {
  entryHtmlKey,
  entryMarkdownKey,
  listHtmlKey,
  llmsTxtKey,
} from "../../domain/service/PublishKeys.js";
import {
  serializeEntryAsMarkdown,
  serializeLlmsTxt,
} from "../../domain/service/MarkdownSerializer.js";
import { TemplateRegistry } from "./TemplateRegistry.js";

/**
 * `HtmlPublishOrchestrator` — the publish pipeline. Renders + writes
 * to `KvCache`:
 *   1. Entry HTML (if a template is registered for the collection)
 *   2. Entry `.md` mirror (if the entry has a `content` field)
 *   3. Collection list HTML for the entry's locale
 *   4. `/llms.txt` for the entry's locale
 *
 * Idempotent — invoking twice with the same entry id is safe; KV
 * writes overwrite. Non-localized entries publish under empty-string
 * locale.
 *
 * Lives in `infrastructure/render/` because it orchestrates two
 * adapters (`DatabaseDriver`-backed read of published entries +
 * `KvCache` writes). Pure formatting (markdown serialization, key
 * derivation) lives in `domain/service/`.
 */
export interface PublishEntryRequest {
  readonly entryId: string;
  readonly site: SiteConfig;
  readonly templates: TemplateRegistry;
  readonly htmlDoctype?: string;
}

const DEFAULT_DOCTYPE = "<!DOCTYPE html>\n";

export class HtmlPublishOrchestrator {
  constructor(
    private readonly db: DatabaseDriver,
    private readonly kv: KvCache,
  ) {}

  async publish(request: PublishEntryRequest): Promise<void> {
    const entry = await readEntry(this.db, request.entryId);
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
      this.renderList(this.db, entry.collection, indexLocale, request.site, request.templates, doctype),
      this.renderLlmsTxt(this.db, indexLocale, request.site),
    ]);
  }

  private async renderEntry(
    entry: Entry,
    site: SiteConfig,
    templates: TemplateRegistry,
    doctype: string,
  ): Promise<void> {
    const tpl = templates.getEntryTemplate(entry.collection);
    if (tpl) {
      const html = doctype + tpl({ entry, site });
      await this.kv.put(entryHtmlKey(entry), html);
    }
    const md = serializeEntryAsMarkdown(entry);
    if (md) {
      await this.kv.put(entryMarkdownKey(entry), md);
    }
  }

  private async renderList(
    db: DatabaseDriver,
    collection: string,
    locale: string | null,
    site: SiteConfig,
    templates: TemplateRegistry,
    doctype: string,
  ): Promise<void> {
    const tpl = templates.getListTemplate(collection);
    if (!tpl) return;
    const entries = await readPublishedEntries(db, { locale, collection });
    const html = doctype + tpl({
      collection,
      locale: locale ?? "",
      entries,
      site,
    });
    await this.kv.put(listHtmlKey(collection, locale ?? ""), html);
  }

  private async renderLlmsTxt(
    db: DatabaseDriver,
    locale: string | null,
    site: SiteConfig,
  ): Promise<void> {
    const allLocaleEntries = await readPublishedEntries(db, { locale });
    const grouped = groupBy(allLocaleEntries, (e) => e.collection);
    await this.kv.put(
      llmsTxtKey(locale ?? ""),
      serializeLlmsTxt({
        site,
        locale: locale ?? "",
        entriesByCollection: grouped,
      }),
    );
  }
}

interface EntryDbRow {
  readonly id: string;
  readonly collection: string;
  readonly status: string;
  readonly version: number;
  readonly data: string;
  readonly created_at: number;
  readonly updated_at: number;
}

async function readEntry(db: DatabaseDriver, id: string): Promise<Entry | null> {
  const row = await db
    .prepare(
      `SELECT id, collection, status, version, data, created_at, updated_at
       FROM entries WHERE id = ?`,
    )
    .bind(id)
    .first<EntryDbRow>();
  return row ? rowToEntry(row) : null;
}

/**
 * Locale filter semantics:
 *   - string  → entries where `data.locale = that locale`
 *   - null    → non-localized entries only (`data.locale IS NULL`)
 *   - omitted → no locale filter
 *
 * Distinguishing `null` from omitted matters: publishing a non-
 * localized entry must NOT pull every locale's content into its
 * `llms.txt` — that would overwrite per-locale indexes with cross-
 * locale soup.
 */
async function readPublishedEntries(
  db: DatabaseDriver,
  filter: { locale?: string | null; collection?: string },
): Promise<Entry[]> {
  const conditions: string[] = [`status = 'published'`];
  const binds: unknown[] = [];
  if (filter.locale === null) {
    conditions.push(`json_extract(data, '$.locale') IS NULL`);
  } else if (typeof filter.locale === "string") {
    conditions.push(`json_extract(data, '$.locale') = ?`);
    binds.push(filter.locale);
  }
  if (filter.collection) {
    conditions.push(`collection = ?`);
    binds.push(filter.collection);
  }
  const sql =
    `SELECT id, collection, status, version, data, created_at, updated_at` +
    ` FROM entries WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC`;
  const rows = await db.prepare(sql).bind(...binds).all<EntryDbRow>();
  return rows.map(rowToEntry);
}

function rowToEntry(row: EntryDbRow): Entry {
  const data = JSON.parse(row.data) as Record<string, unknown>;
  const dataLocale = data["locale"];
  return {
    id: row.id,
    collection: row.collection,
    locale: typeof dataLocale === "string" ? dataLocale : undefined,
    status: row.status as ContentState,
    version: row.version,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = keyOf(item);
    const arr = out.get(k);
    if (arr) arr.push(item);
    else out.set(k, [item]);
  }
  return out;
}
