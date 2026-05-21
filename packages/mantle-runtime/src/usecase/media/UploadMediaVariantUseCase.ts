import { DiagnosticError } from "@aotter/mantle-spec";
import type { KvCache } from "../../domain/port/KvCache.js";
import type {
  MediaStorage,
  MediaVariantRole,
} from "../../domain/port/MediaStorage.js";
import type { UploadMediaVariantRequest } from "../dto/media/index.js";
import {
  mediaUploadExpiredDiagnostic,
  mediaVariantSizeExceededDiagnostic,
  mediaMimeRejectedDiagnostic,
} from "./diagnostics.js";
import { PENDING_UPLOAD_KV_PREFIX } from "./mediaAllowlist.js";
import type {
  PendingUploadRecord,
  PendingUploadVariant,
} from "./PendingUploadRecord.js";

/**
 * Server-side byte write for one variant of a pending upload — the
 * sandboxed-agent alternative to the presigned-PUT path produced by
 * `createUpload`. Used by the `upload_media_variant` MCP tool when
 * the caller can't reach the storage backend directly (#283 — Claude
 * Cowork's outbound proxy doesn't allowlist R2 hosts; the MCP
 * transport gets traffic to the Worker via api.anthropic.com).
 *
 * Validates the request against the existing `PendingUploadRecord`
 * (must match purpose + role + mimeType + size cap) then asks the
 * storage adapter to write the bytes. The pending record is NOT
 * deleted here — commit still HEAD-verifies the object via the same
 * code path as the presigned-PUT case. All-or-nothing across the
 * variant bundle still applies at commit time; this use case just
 * lands one variant's bytes.
 *
 * Same purpose policies as the presigned path: per-mime `maxBytes`,
 * per-purpose declared variant set, all already validated by
 * `CreateMediaUploadUseCase` when the agent first opened the group.
 */
export class UploadMediaVariantUseCase {
  constructor(
    private readonly storage: MediaStorage,
    private readonly kv: KvCache,
  ) {}

  async execute(
    request: UploadMediaVariantRequest,
  ): Promise<{ storageKey: string; byteSize: number }> {
    const opPath = "usecase/UploadMediaVariant";

    const kvKey = `${PENDING_UPLOAD_KV_PREFIX}${request.uploadGroupId}`;
    const raw = await this.kv.get(kvKey);
    if (!raw) {
      throw new DiagnosticError(
        mediaUploadExpiredDiagnostic(opPath, request.uploadGroupId),
      );
    }
    const record = JSON.parse(raw) as PendingUploadRecord;

    // Find the matching declared variant. The pending record's
    // variants[] is the source of truth for "what role + mime are
    // valid in this group"; an agent uploading something not in the
    // declared set is rejected the same way create-then-PUT would
    // have rejected an unknown storageKey.
    const declared = findMatchingVariant(record.variants, request.role, request.mimeType);
    if (!declared) {
      throw new DiagnosticError(
        mediaMimeRejectedDiagnostic(opPath, request.mimeType),
      );
    }

    const byteSize = request.bytes.byteLength;
    if (byteSize > declared.maxBytes) {
      throw new DiagnosticError(
        mediaVariantSizeExceededDiagnostic(
          opPath,
          request.mimeType,
          byteSize,
          declared.maxBytes,
        ),
      );
    }

    const result = await this.storage.putVariantBytes({
      uploadGroupId: request.uploadGroupId,
      purpose: record.purpose,
      role: request.role,
      mimeType: request.mimeType,
      filename: record.filename,
      bytes: request.bytes,
    });

    return { storageKey: result.storageKey, byteSize };
  }
}

function findMatchingVariant(
  variants: ReadonlyArray<PendingUploadVariant>,
  role: MediaVariantRole,
  mimeType: string,
): PendingUploadVariant | undefined {
  return variants.find((v) => v.role === role && v.mimeType === mimeType);
}
