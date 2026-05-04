import type { ContentState } from "@aotter/mantle-spec";

/**
 * Content-op request DTOs. Each verb takes its own request type;
 * response is `EntryRow` (or `{ removed: boolean }` for delete) which
 * lives in `domain/model/`. Per the clean-arch DTO rule, no loose
 * primitives — every input field is named on the DTO.
 */

export interface CreateDraftRequest {
  readonly collection: string;
  readonly data: Record<string, unknown>;
  readonly authorId: string | null;
}

export interface UpdateDraftRequest {
  readonly id: string;
  readonly expectedVersion: number;
  /** Partial data — merged onto the existing row's `data` blob. */
  readonly data: Record<string, unknown>;
}

export interface GetEntryRequest {
  readonly id: string;
  /** When set, asserts the row's collection matches; rejects with
   *  `NOT_FOUND` otherwise. */
  readonly collection?: string;
}

export interface ListEntriesRequest {
  readonly collection: string;
  readonly status?: ContentState;
  readonly limit?: number;
}

export interface RequestPublishRequest {
  readonly id: string;
}

export interface UnpublishRequest {
  readonly id: string;
}

export interface ArchiveRequest {
  readonly id: string;
  readonly expectedVersion: number;
}

export interface DeleteEntryRequest {
  readonly id: string;
}

export interface DeleteEntryResponse {
  readonly removed: boolean;
}
