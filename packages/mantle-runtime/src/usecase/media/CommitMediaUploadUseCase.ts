import { DiagnosticError } from "@aotter/mantle-spec";
import type { Clock } from "../../domain/port/Clock.js";
import type { KvCache } from "../../domain/port/KvCache.js";
import type { MediaAssetRepository } from "../../domain/port/MediaAssetRepository.js";
import type {
  CommitUploadVariantSpec,
  MediaAsset,
  MediaStorage,
} from "../../domain/port/MediaStorage.js";
import type { CommitMediaUploadRequest } from "../dto/media/index.js";
import { mediaUploadExpiredDiagnostic } from "./diagnostics.js";
import { PENDING_UPLOAD_KV_PREFIX } from "./mediaAllowlist.js";
import type { PendingUploadRecord } from "./PendingUploadRecord.js";

/**
 * Finalise the variant bundle issued by `create_media_upload`. Reads
 * the `PendingUploadRecord` from KV (each variant's expected
 * mime + size + storageKey), asks the adapter to verify every
 * uploaded object (HEAD + bytes), and on success persists the
 * resulting `MediaAsset` to the `media_assets` table.
 *
 * All-or-nothing: any variant failing HEAD-verify rejects the whole
 * commit. The orphan sweeper (#254) cleans up partially-uploaded
 * bundles whose pending record expired.
 */
export class CommitMediaUploadUseCase {
  constructor(
    private readonly storage: MediaStorage,
    private readonly kv: KvCache,
    private readonly clock: Clock,
    private readonly assets: MediaAssetRepository,
  ) {}

  async execute(request: CommitMediaUploadRequest): Promise<MediaAsset> {
    const opPath = "usecase/CommitMediaUpload";
    const kvKey = `${PENDING_UPLOAD_KV_PREFIX}${request.uploadGroupId}`;
    const raw = await this.kv.get(kvKey);
    if (!raw) {
      throw new DiagnosticError(
        mediaUploadExpiredDiagnostic(opPath, request.uploadGroupId),
      );
    }
    const record = JSON.parse(raw) as PendingUploadRecord;

    const variantSpecs: ReadonlyArray<CommitUploadVariantSpec> = record.variants.map((v) => ({
      mimeType: v.mimeType,
      role: v.role,
      storageKey: v.storageKey,
      maxBytes: Math.min(v.maxBytes, v.expectedSize),
    }));

    const asset = await this.storage.commitUpload({
      uploadGroupId: request.uploadGroupId,
      filename: record.filename,
      variants: variantSpecs,
      alt: request.alt ?? record.alt,
      caption: request.caption ?? record.caption,
      now: this.clock.now(),
    });

    await this.assets.save(asset);

    // Best-effort cleanup. KV TTL covers us if delete fails.
    await this.kv.delete(kvKey).catch(() => undefined);

    return asset;
  }
}
