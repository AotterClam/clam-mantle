import { DiagnosticError } from "@aotter/mantle-spec";
import type { Clock } from "../../domain/port/Clock.js";
import type { KvCache } from "../../domain/port/KvCache.js";
import type { MediaAsset, MediaStorage } from "../../domain/port/MediaStorage.js";
import type { CommitMediaUploadRequest } from "../dto/media/index.js";
import {
  mediaUploadExpiredDiagnostic,
} from "./diagnostics.js";
import {
  DEFAULT_MAX_BYTES,
  PENDING_UPLOAD_KV_PREFIX,
} from "./mediaAllowlist.js";
import type { PendingUploadRecord } from "./PendingUploadRecord.js";

export class CommitMediaUploadUseCase {
  constructor(
    private readonly storage: MediaStorage,
    private readonly kv: KvCache,
    private readonly clock: Clock,
    private readonly opts: { readonly maxBytes?: number } = {},
  ) {}

  async execute(request: CommitMediaUploadRequest): Promise<MediaAsset> {
    const opPath = "usecase/CommitMediaUpload";
    const kvKey = `${PENDING_UPLOAD_KV_PREFIX}${request.uploadId}`;
    const raw = await this.kv.get(kvKey);
    if (!raw) {
      throw new DiagnosticError(mediaUploadExpiredDiagnostic(opPath, request.uploadId));
    }
    const record = JSON.parse(raw) as PendingUploadRecord;
    const maxBytes = this.opts.maxBytes ?? DEFAULT_MAX_BYTES;

    const asset = await this.storage.commitUpload({
      uploadId: request.uploadId,
      storageKey: record.storageKey,
      expectedMimeType: record.expectedMimeType,
      maxBytes,
      alt: request.alt,
      caption: request.caption,
      checksum: request.checksum,
      now: this.clock.now(),
    });

    // Best-effort cleanup. KV TTL covers us if delete fails.
    await this.kv.delete(kvKey).catch(() => undefined);

    return asset;
  }
}
