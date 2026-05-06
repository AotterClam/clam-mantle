import type { ContentState } from "@aotter/mantle-spec";
import type {
  ArchiveEntryArgs,
  CreateEntryArgs,
  DeleteEntryArgs,
  EntryRepository,
  FindEntryByDataFieldArgs,
  ListEntriesArgs,
  TransitionStatusArgs,
  UpdateEntryArgs,
} from "../../domain/port/EntryRepository.js";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import {
  EntryStatusConflict,
  EntryVersionConflict,
  liftLocale,
  type EntryRow,
} from "../../domain/model/EntryRow.js";

/**
 * `EntryRepository` impl backed by `DatabaseDriver`. Adapters that
 * implement `DatabaseDriver` (CF binds D1; future Postgres, Neon,
 * etc.) get this repository for free; the SQL is SQLite-shaped
 * (which Postgres can also execute via Hyperdrive when v0.2 lands).
 *
 * `UPDATE … RETURNING` collapses the post-write SELECT to one round
 * trip on SQLite ≥ 3.35 / Postgres. `delete` uses
 * `DatabaseDriver.batch` because SQLite doesn't enforce FK ON DELETE
 * CASCADE by default and we'd otherwise orphan revisions / approvals
 * when the parent goes.
 *
 * Lifts `data.locale` to `EntryRow.locale` at the rowFromDb boundary
 * — see ADR-0010 + `domain/model/EntryRow.ts`.
 */
export class DatabaseEntryRepository implements EntryRepository {
  constructor(private readonly db: DatabaseDriver) {}

  async create(args: CreateEntryArgs): Promise<EntryRow> {
    await this.db
      .prepare(
        `INSERT INTO entries (id, collection, status, version, data, author_id, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
      )
      .bind(
        args.id,
        args.collection,
        args.status,
        JSON.stringify(args.data),
        args.authorId,
        args.now,
        args.now,
      )
      .run();
    return {
      id: args.id,
      collection: args.collection,
      locale: liftLocale(args.data),
      status: args.status,
      version: 1,
      data: args.data,
      authorId: args.authorId,
      createdAt: args.now,
      updatedAt: args.now,
    };
  }

  async get(id: string): Promise<EntryRow | null> {
    const row = await this.db
      .prepare(
        `SELECT id, collection, status, version, data, author_id, created_at, updated_at
         FROM entries WHERE id = ?`,
      )
      .bind(id)
      .first<EntryDbRow>();
    return row ? rowFromDb(row) : null;
  }

  async update(args: UpdateEntryArgs): Promise<EntryRow> {
    const newVersion = args.expectedVersion + 1;
    const row = await this.db
      .prepare(
        `UPDATE entries SET data = ?, version = ?, updated_at = ?
         WHERE id = ? AND version = ?
         RETURNING id, collection, status, version, data, author_id, created_at, updated_at`,
      )
      .bind(
        JSON.stringify(args.data),
        newVersion,
        args.now,
        args.id,
        args.expectedVersion,
      )
      .first<EntryDbRow>();
    if (!row) throw await this.versionConflict(args.id, args.expectedVersion);
    return rowFromDb(row);
  }

  async delete(args: DeleteEntryArgs): Promise<{ readonly removed: boolean }> {
    const result = await this.db.batch([
      this.db.prepare(`DELETE FROM revisions WHERE entry_id = ?`).bind(args.id),
      this.db.prepare(`DELETE FROM approvals WHERE entry_id = ?`).bind(args.id),
      this.db.prepare(`DELETE FROM entries WHERE id = ?`).bind(args.id),
    ]);
    const last = result[result.length - 1];
    return { removed: (last?.meta.changes ?? 0) > 0 };
  }

  async archive(args: ArchiveEntryArgs): Promise<EntryRow> {
    const newVersion = args.expectedVersion + 1;
    const row = await this.db
      .prepare(
        `UPDATE entries SET status = 'archived', version = ?, updated_at = ?
         WHERE id = ? AND version = ?
         RETURNING id, collection, status, version, data, author_id, created_at, updated_at`,
      )
      .bind(newVersion, args.now, args.id, args.expectedVersion)
      .first<EntryDbRow>();
    if (!row) throw await this.versionConflict(args.id, args.expectedVersion);
    return rowFromDb(row);
  }

  async transitionStatus(args: TransitionStatusArgs): Promise<EntryRow> {
    const guarded = args.expectedStatus !== undefined;
    const sql =
      `UPDATE entries SET status = ?, version = version + 1, updated_at = ?
       WHERE id = ?${guarded ? " AND status = ?" : ""}
       RETURNING id, collection, status, version, data, author_id, created_at, updated_at`;
    const stmt = guarded
      ? this.db.prepare(sql).bind(args.to, args.now, args.id, args.expectedStatus)
      : this.db.prepare(sql).bind(args.to, args.now, args.id);
    const row = await stmt.first<EntryDbRow>();
    if (!row) {
      const after = await this.db
        .prepare(`SELECT status FROM entries WHERE id = ?`)
        .bind(args.id)
        .first<{ status: string }>();
      throw new EntryStatusConflict(
        args.id,
        args.expectedStatus ?? args.to,
        (after?.status as ContentState | undefined) ?? args.to,
      );
    }
    return rowFromDb(row);
  }

  async list(args: ListEntriesArgs): Promise<readonly EntryRow[]> {
    const limit = args.limit ?? 100;
    const stmt = args.status
      ? this.db
          .prepare(
            `SELECT id, collection, status, version, data, author_id, created_at, updated_at
             FROM entries WHERE collection = ? AND status = ?
             ORDER BY updated_at DESC LIMIT ?`,
          )
          .bind(args.collection, args.status, limit)
      : this.db
          .prepare(
            `SELECT id, collection, status, version, data, author_id, created_at, updated_at
             FROM entries WHERE collection = ?
             ORDER BY updated_at DESC LIMIT ?`,
          )
          .bind(args.collection, limit);
    const rows = await stmt.all<EntryDbRow>();
    return rows.map(rowFromDb);
  }

  async findByDataField(args: FindEntryByDataFieldArgs): Promise<EntryRow | null> {
    const path = jsonPathForTopLevelField(args.field);
    const stmt = args.status
      ? this.db
          .prepare(
            `SELECT id, collection, status, version, data, author_id, created_at, updated_at
             FROM entries
             WHERE collection = ? AND status = ? AND json_extract(data, ?) = ?
             ORDER BY updated_at DESC LIMIT 1`,
          )
          .bind(args.collection, args.status, path, args.value)
      : this.db
          .prepare(
            `SELECT id, collection, status, version, data, author_id, created_at, updated_at
             FROM entries
             WHERE collection = ? AND json_extract(data, ?) = ?
             ORDER BY updated_at DESC LIMIT 1`,
          )
          .bind(args.collection, path, args.value);
    const row = await stmt.first<EntryDbRow>();
    return row ? rowFromDb(row) : null;
  }

  private async versionConflict(
    id: string,
    expected: number,
  ): Promise<EntryVersionConflict> {
    const after = await this.db
      .prepare(`SELECT version FROM entries WHERE id = ?`)
      .bind(id)
      .first<{ version: number }>();
    return new EntryVersionConflict(id, expected, after?.version ?? -1);
  }
}

interface EntryDbRow {
  readonly id: string;
  readonly collection: string;
  readonly status: string;
  readonly version: number;
  readonly data: string;
  readonly author_id: string | null;
  readonly created_at: number;
  readonly updated_at: number;
}

function rowFromDb(row: EntryDbRow): EntryRow {
  const data = JSON.parse(row.data) as Record<string, unknown>;
  return {
    id: row.id,
    collection: row.collection,
    locale: liftLocale(data),
    status: row.status as ContentState,
    version: row.version,
    data,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function jsonPathForTopLevelField(field: string): string {
  return `$."${field.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
