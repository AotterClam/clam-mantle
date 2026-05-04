import type { ContentState } from "@aotterclam/clam-cms-spec";
import type { EntryRow } from "../model/EntryRow.js";

/**
 * `EntryRepository` — chokepoint for every entry mutation. Content-op
 * use cases, MCP handlers, and (in v0.1.x) builtin Procedure handlers
 * all route their writes through this interface so OCC, status
 * guards, and lifecycle hooks have exactly one place to enforce them.
 *
 * The `DatabaseDriver`-backed implementation lives in
 * `infrastructure/persistence/DatabaseEntryRepository`; the test
 * harness ships an in-memory fake in `test/fakes/`.
 *
 * Renamed from `EntryStore` per the clean-architecture naming
 * convention (`*Repository` for data access).
 */
export interface EntryRepository {
  create(args: CreateEntryArgs): Promise<EntryRow>;
  get(id: string): Promise<EntryRow | null>;
  /** Throws `EntryVersionConflict` on OCC mismatch. */
  update(args: UpdateEntryArgs): Promise<EntryRow>;
  /** Cascades to revisions + approvals child rows for the entry id. */
  delete(id: string): Promise<{ readonly removed: boolean }>;
  /** Throws `EntryVersionConflict` on OCC mismatch. */
  archive(args: ArchiveEntryArgs): Promise<EntryRow>;
  /** Status flip without data update. `expectedStatus`, when set,
   *  atomically asserts pre-flip status to prevent races (e.g. a
   *  concurrent publish while we try to archive). Bumps version.
   *  Throws `EntryStatusConflict` on guard mismatch. */
  transitionStatus(args: TransitionStatusArgs): Promise<EntryRow>;
  /** List entries in a collection, optionally filtered by status. */
  list(args: ListEntriesArgs): Promise<readonly EntryRow[]>;
}

export interface CreateEntryArgs {
  readonly id: string;
  readonly collection: string;
  readonly status: ContentState;
  readonly data: Record<string, unknown>;
  readonly authorId: string | null;
  readonly now: number;
}

export interface UpdateEntryArgs {
  readonly id: string;
  readonly expectedVersion: number;
  readonly data: Record<string, unknown>;
  readonly now: number;
}

export interface ArchiveEntryArgs {
  readonly id: string;
  readonly expectedVersion: number;
  readonly now: number;
}

export interface TransitionStatusArgs {
  readonly id: string;
  readonly to: ContentState;
  readonly expectedStatus?: ContentState;
  readonly now: number;
}

export interface ListEntriesArgs {
  readonly collection: string;
  readonly status?: ContentState;
  readonly limit?: number;
}
