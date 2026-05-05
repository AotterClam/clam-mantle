import { type ContentState, type Entry } from "@aotter/mantle-spec";
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

/** Single-entry lookup by id. Used by the publish pipeline to load
 *  the entry it's about to render; lifted into the domain service so
 *  the orchestrator stops owning row-to-domain mapping. */
export async function readEntryById(
  db: DatabaseDriver,
  id: string,
): Promise<Entry | null> {
  const row = await db
    .prepare(
      `SELECT id, collection, status, version, data, created_at, updated_at` +
        ` FROM entries WHERE id = ?`,
    )
    .bind(id)
    .first<EntryDbRow>();
  return row ? rowToEntry(row) : null;
}

/** Lookup an entry by (collection, slug[, locale][, status]). Used by
 *  request-time render paths (preview, live-dev) that route by URL
 *  slug — not the publish pipeline's flow which already holds the
 *  entry id. Returns the most-recently-updated row if multiple
 *  match. */
export interface ReadEntryBySlugArgs {
  readonly collection: string;
  readonly slug: string;
  /** `string` filters to that locale; `null` filters to non-localized
   *  entries (data.locale IS NULL); omitted = no locale filter. */
  readonly locale?: string | null;
  readonly status?: ContentState;
}

export async function readEntryBySlug(
  db: DatabaseDriver,
  args: ReadEntryBySlugArgs,
): Promise<Entry | null> {
  const conditions: string[] = ["collection = ?", `json_extract(data, '$.slug') = ?`];
  const binds: unknown[] = [args.collection, args.slug];
  if (args.locale === null) {
    conditions.push(`json_extract(data, '$.locale') IS NULL`);
  } else if (typeof args.locale === "string") {
    conditions.push(`json_extract(data, '$.locale') = ?`);
    binds.push(args.locale);
  }
  if (args.status) {
    conditions.push("status = ?");
    binds.push(args.status);
  }
  const sql =
    `SELECT id, collection, status, version, data, created_at, updated_at` +
    ` FROM entries WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC LIMIT 1`;
  const row = await db.prepare(sql).bind(...binds).first<EntryDbRow>();
  return row ? rowToEntry(row) : null;
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
