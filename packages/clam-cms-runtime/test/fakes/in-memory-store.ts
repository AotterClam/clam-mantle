import type { ContentState } from "@aotterclam/clam-cms-spec";
import {
  EntryStatusConflict,
  EntryVersionConflict,
  liftLocale,
  type EntryRow,
} from "../../src/domain/model/EntryRow.js";
import type {
  ArchiveEntryArgs,
  CreateEntryArgs,
  EntryRepository,
  ListEntriesArgs,
  TransitionStatusArgs,
  UpdateEntryArgs,
} from "../../src/domain/port/EntryRepository.js";

/**
 * In-memory `EntryRepository` for content-op + state-machine tests.
 * Zero SQL — just a Map keyed by id. Used wherever a test cares about
 * the use-case verb logic and not SQL execution.
 *
 * Lifts `data.locale` to `EntryRow.locale` at every write so the row
 * shape matches the production `DatabaseEntryRepository` impl.
 */
export class InMemoryEntryRepository implements EntryRepository {
  private rows = new Map<string, EntryRow>();

  async create(args: CreateEntryArgs): Promise<EntryRow> {
    if (this.rows.has(args.id)) throw new Error(`duplicate id: ${args.id}`);
    const data = { ...args.data };
    const row: EntryRow = {
      id: args.id,
      collection: args.collection,
      locale: liftLocale(data),
      status: args.status,
      version: 1,
      data,
      authorId: args.authorId,
      createdAt: args.now,
      updatedAt: args.now,
    };
    this.rows.set(args.id, row);
    return row;
  }

  async get(id: string): Promise<EntryRow | null> {
    return this.rows.get(id) ?? null;
  }

  async update(args: UpdateEntryArgs): Promise<EntryRow> {
    const row = this.rows.get(args.id);
    if (!row) throw new EntryVersionConflict(args.id, args.expectedVersion, -1);
    if (row.version !== args.expectedVersion) {
      throw new EntryVersionConflict(args.id, args.expectedVersion, row.version);
    }
    const data = { ...args.data };
    const next: EntryRow = {
      ...row,
      locale: liftLocale(data),
      data,
      version: row.version + 1,
      updatedAt: args.now,
    };
    this.rows.set(args.id, next);
    return next;
  }

  async delete(id: string): Promise<{ readonly removed: boolean }> {
    const removed = this.rows.delete(id);
    return { removed };
  }

  async archive(args: ArchiveEntryArgs): Promise<EntryRow> {
    const row = this.rows.get(args.id);
    if (!row) throw new EntryVersionConflict(args.id, args.expectedVersion, -1);
    if (row.version !== args.expectedVersion) {
      throw new EntryVersionConflict(args.id, args.expectedVersion, row.version);
    }
    const next: EntryRow = {
      ...row,
      status: "archived" as ContentState,
      version: row.version + 1,
      updatedAt: args.now,
    };
    this.rows.set(args.id, next);
    return next;
  }

  async transitionStatus(args: TransitionStatusArgs): Promise<EntryRow> {
    const row = this.rows.get(args.id);
    if (!row) throw new EntryStatusConflict(args.id, args.expectedStatus ?? args.to, args.to);
    if (args.expectedStatus !== undefined && row.status !== args.expectedStatus) {
      throw new EntryStatusConflict(args.id, args.expectedStatus, row.status);
    }
    const next: EntryRow = {
      ...row,
      status: args.to,
      version: row.version + 1,
      updatedAt: args.now,
    };
    this.rows.set(args.id, next);
    return next;
  }

  async list(args: ListEntriesArgs): Promise<readonly EntryRow[]> {
    const limit = args.limit ?? 100;
    const filtered: EntryRow[] = [];
    for (const row of this.rows.values()) {
      if (row.collection !== args.collection) continue;
      if (args.status && row.status !== args.status) continue;
      filtered.push(row);
    }
    filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    return filtered.slice(0, limit);
  }

  /** Test helper — directly insert/replace rows without going through
   *  the chokepoint. Use sparingly. */
  _seed(row: EntryRow): void {
    this.rows.set(row.id, row);
  }
}
