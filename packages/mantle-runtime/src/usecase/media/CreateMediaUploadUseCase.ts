import { DiagnosticError } from "@aotter/mantle-spec";
import type { Clock } from "../../domain/port/Clock.js";
import type { KvCache } from "../../domain/port/KvCache.js";
import type { MediaStorage } from "../../domain/port/MediaStorage.js";
import type { SiteConfigRepository } from "../../domain/port/SiteConfigRepository.js";
import type {
  CreateMediaUploadRequest,
  CreateMediaUploadResponse,
} from "../dto/media/index.js";
import {
  mediaMimeRejectedDiagnostic,
  mediaPurposeRejectedDiagnostic,
  mediaSizeExceededDiagnostic,
  mediaSvgRejectedDiagnostic,
} from "./diagnostics.js";
import {
  DEFAULT_MAX_BYTES,
  MEDIA_SVG_MIME,
  PENDING_UPLOAD_KV_PREFIX,
  PENDING_UPLOAD_KV_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  isAllowedMime,
} from "./mediaAllowlist.js";
import type { PendingUploadRecord } from "./PendingUploadRecord.js";

export class CreateMediaUploadUseCase {
  constructor(
    private readonly storage: MediaStorage,
    private readonly kv: KvCache,
    private readonly clock: Clock,
    private readonly siteConfig: SiteConfigRepository,
    private readonly opts: { readonly allowSvg: boolean; readonly maxBytes?: number } = {
      allowSvg: false,
    },
  ) {}

  async execute(request: CreateMediaUploadRequest): Promise<CreateMediaUploadResponse> {
    const opPath = "usecase/CreateMediaUpload";
    const maxBytes = this.opts.maxBytes ?? DEFAULT_MAX_BYTES;

    // Fail-closed purpose enforcement (#262). Empty `media.purposes` —
    // either undeclared or operator-cleared — disables uploads entirely
    // at this layer; the MCP tool catalog + admin endpoint also gate on
    // the same condition for cleaner UX. Reading per request rather
    // than snapshotting at boot lets operator edits via the admin
    // Settings page take effect without a redeploy.
    const declared = await this.siteConfig.readMediaPurposes();
    if (declared.length === 0 || !request.purpose || !declared.includes(request.purpose)) {
      throw new DiagnosticError(
        mediaPurposeRejectedDiagnostic(opPath, request.purpose, declared),
      );
    }

    if (request.mimeType === MEDIA_SVG_MIME && !this.opts.allowSvg) {
      throw new DiagnosticError(mediaSvgRejectedDiagnostic(opPath));
    }
    if (!isAllowedMime(request.mimeType, this.opts.allowSvg)) {
      throw new DiagnosticError(mediaMimeRejectedDiagnostic(opPath, request.mimeType));
    }
    // Enforce the ceiling before minting a presigned URL — see
    // CreateMediaUploadRequest.byteSize for the WHY.
    if (request.byteSize > maxBytes) {
      throw new DiagnosticError(
        mediaSizeExceededDiagnostic(opPath, request.byteSize, maxBytes),
      );
    }

    const now = this.clock.now();
    const expiresAt = now + UPLOAD_URL_TTL_SECONDS * 1000;

    const capability = await this.storage.createUpload({
      filename: request.filename,
      mimeType: request.mimeType,
      byteSize: request.byteSize,
      maxBytes,
      purpose: request.purpose,
      now,
      expiresAt,
    });

    const record: PendingUploadRecord = {
      storageKey: capability.storageKey,
      expectedMimeType: request.mimeType,
      expectedSize: request.byteSize,
      expiresAt: capability.expiresAt,
      createdAt: now,
    };

    await this.kv.put(
      `${PENDING_UPLOAD_KV_PREFIX}${capability.uploadId}`,
      JSON.stringify(record),
      { expirationTtl: PENDING_UPLOAD_KV_TTL_SECONDS },
    );

    return {
      uploadId: capability.uploadId,
      uploadUrl: capability.uploadUrl,
      method: capability.method,
      requiredHeaders: capability.requiredHeaders,
      expiresAt: capability.expiresAt,
    };
  }
}
