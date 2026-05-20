import type { MediaVariantRole } from "../../domain/port/MediaStorage.js";

/** KV record persisted by `CreateMediaUploadUseCase` and read by
 *  `CommitMediaUploadUseCase`. Stored under
 *  `${PENDING_UPLOAD_KV_PREFIX}${uploadGroupId}` with a TTL set to
 *  `PENDING_UPLOAD_KV_TTL_SECONDS`.
 *
 *  Multi-variant from the start (#272): one record tracks every
 *  variant the agent declared, so commit can HEAD all N R2 objects
 *  in one atomic shot.
 */
export interface PendingUploadRecord {
  readonly purpose: string;
  readonly variants: ReadonlyArray<PendingUploadVariant>;
  readonly alt?: string;
  readonly caption?: string;
  readonly expiresAt: number;
  readonly createdAt: number;
}

export interface PendingUploadVariant {
  readonly mimeType: string;
  readonly role: MediaVariantRole;
  readonly storageKey: string;
  /** Caller-declared byte size, persisted at create time so commit
   *  can enforce a tight per-variant ceiling rather than just the
   *  per-purpose `maxBytes`. The adapter ultimately verifies actual
   *  stored bytes ≤ this. */
  readonly expectedSize: number;
  /** Per-purpose `maxBytes[mimeType]`. Forwarded to the adapter so
   *  HEAD-verify rejects oversized PUTs with the right cap message. */
  readonly maxBytes: number;
}
