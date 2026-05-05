import { type ContentState, type Entry } from "@aotterclam/clam-cms-spec";
import type { DatabaseDriver } from "../port/DatabaseDriver.js";

/**
 * Cross-collection scan of `status='published'` entries. Pure read,
 * no rendering. Used by every renderer that crosses Schema boundaries
 * (`HtmlPublishOrchestrator`, `ComposeLlmsTxtUseCase`,
 * `ComposeSitemapUseCase`). Distinguishes the three locale modes:
 *
 *   - locale: string — only entries where `data.locale = locale`
 *   - locale: null   — only non-localized entries (`data.locale IS NULL`)
 *   - omitted        — every locale + non-localized
 *
 * The locale=null case matters for publish: writing a non-localized
 * entry must not overwrite per-locale indexes with cross-locale soup.
 */
export interface PublishedEntriesFilter {
  readonly locale?: string | null;
  readonly collection?: string;
  /** Optional `LIMIT N` on the SQL query — caps both D1 read and JS
   *  memory. Sitemap composition uses this; publish pipeline omits
   *  (one entry-locale-collection scan is naturally small). */
  readonly limit?: number;
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

export async function readPublishedEntries(
  db: DatabaseDriver,
  filter: PublishedEntriesFilter = {},
): Promise<Entry[]> {
  const conditions: string[] = ["status = 'published'"];
  const binds: unknown[] = [];
  if (filter.locale === null) {
    conditions.push(`json_extract(data, '$.locale') IS NULL`);
  } else if (typeof filter.locale === "string") {
    conditions.push(`json_extract(data, '$.locale') = ?`);
    binds.push(filter.locale);
  }
  if (filter.collection) {
    conditions.push("collection = ?");
    binds.push(filter.collection);
  }
  let sql =
    `SELECT id, collection, status, version, data, created_at, updated_at` +
    ` FROM entries WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC`;
  if (typeof filter.limit === "number" && Number.isFinite(filter.limit) && filter.limit > 0) {
    sql += ` LIMIT ${Math.floor(filter.limit)}`;
  }
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
