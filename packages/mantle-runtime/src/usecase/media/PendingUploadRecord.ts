/** KV record persisted by `CreateMediaUploadUseCase` and read by
 *  `CommitMediaUploadUseCase`. Stored under
 *  `${PENDING_UPLOAD_KV_PREFIX}${uploadId}` with a TTL set to
 *  `PENDING_UPLOAD_KV_TTL_SECONDS`. */
export interface PendingUploadRecord {
  readonly storageKey: string;
  readonly expectedMimeType: string;
  /** Caller-declared byte size, persisted at create time so commit can
   *  enforce a tight per-upload ceiling instead of just the adapter-
   *  wide `maxBytes`. Adapter ultimately verifies actual stored bytes
   *  ≤ commit-supplied maxBytes — `CommitMediaUploadUseCase` passes
   *  `min(adapterCap, record.expectedSize)`. */
  readonly expectedSize: number;
  readonly expiresAt: number;
  readonly createdAt: number;
}
