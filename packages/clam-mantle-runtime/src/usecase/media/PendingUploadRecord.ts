/** KV record persisted by `CreateMediaUploadUseCase` and read by
 *  `CommitMediaUploadUseCase`. Stored under
 *  `${PENDING_UPLOAD_KV_PREFIX}${uploadId}` with a TTL set to
 *  `PENDING_UPLOAD_KV_TTL_SECONDS`. */
export interface PendingUploadRecord {
  readonly storageKey: string;
  readonly expectedMimeType: string;
  readonly expectedSize?: number;
  readonly expiresAt: number;
  readonly createdAt: number;
}
