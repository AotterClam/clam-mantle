import { DiagnosticError, type MediaPurposePolicy } from "@aotter/mantle-spec";
import type { Clock } from "../../domain/port/Clock.js";
import type { IdGenerator } from "../../domain/port/IdGenerator.js";
import type { KvCache } from "../../domain/port/KvCache.js";
import type {
  CreateUploadVariantSpec,
  MediaStorage,
} from "../../domain/port/MediaStorage.js";
import type { SiteConfigRepository } from "../../domain/port/SiteConfigRepository.js";
import type {
  CreateMediaUploadRequest,
  CreateMediaUploadResponse,
  CreateMediaUploadVariantRequest,
} from "../dto/media/index.js";
import {
  mediaMimeRejectedDiagnostic,
  mediaPurposeRejectedDiagnostic,
  mediaSvgRejectedDiagnostic,
  mediaVariantSizeExceededDiagnostic,
  mediaVariantsIncompleteDiagnostic,
  mediaVariantsSuspiciousSizeDiagnostic,
} from "./diagnostics.js";
import {
  MEDIA_SVG_MIME,
  PENDING_UPLOAD_KV_PREFIX,
  PENDING_UPLOAD_KV_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  isAllowedMime,
} from "./mediaAllowlist.js";
import type {
  PendingUploadRecord,
  PendingUploadVariant,
} from "./PendingUploadRecord.js";

/**
 * Issue presigned upload capabilities for every variant the agent
 * declares for one logical media asset (#272). The asset's `id` is
 * minted here and surfaces as `uploadGroupId` in the response — the
 * caller passes it back to `commit_media_upload`.
 *
 * Optimization runs agent-side via `@aotter/mantle-media-tools`. This
 * use case enforces policy only — never transforms bytes:
 *  - purpose must be declared in `siteDefaults.media.purposes`
 *  - variants must cover every required mime for that purpose
 *  - each variant's byteSize ≤ `policy.maxBytes[mime]`
 *  - mime allowlist (still gates per variant; SVG opt-in via ctor)
 *  - "suspicious shape" heuristic: modern formats (avif / webp) MUST
 *    NOT be larger than the fallback (jpeg) — uploader skipped
 *    optimization → hard fail rather than emit a `<picture>` slower
 *    than the bare `<img>`.
 */
export class CreateMediaUploadUseCase {
  constructor(
    private readonly storage: MediaStorage,
    private readonly kv: KvCache,
    private readonly clock: Clock,
    private readonly idgen: IdGenerator,
    private readonly siteConfig: SiteConfigRepository,
    private readonly opts: { readonly allowSvg: boolean } = { allowSvg: false },
  ) {}

  async execute(request: CreateMediaUploadRequest): Promise<CreateMediaUploadResponse> {
    const opPath = "usecase/CreateMediaUpload";

    const declared = await this.siteConfig.readMediaPurposes();
    const declaredNames = declared.map((p) => p.name);
    const policy = declared.find((p) => p.name === request.purpose);
    if (!policy) {
      throw new DiagnosticError(
        mediaPurposeRejectedDiagnostic(opPath, request.purpose, declaredNames),
      );
    }

    this.assertVariantsCoverPolicy(opPath, request, policy);
    this.assertEachVariantAccepted(opPath, request);
    this.assertNoSuspiciousSizing(opPath, request);

    const now = this.clock.now();
    const expiresAt = now + UPLOAD_URL_TTL_SECONDS * 1000;
    const uploadGroupId = this.idgen.next();

    const variantSpecs: ReadonlyArray<CreateUploadVariantSpec> = request.variants.map((v) => ({
      mimeType: v.mimeType,
      byteSize: v.byteSize,
      maxBytes: policy.maxBytes[v.mimeType] ?? Number.MAX_SAFE_INTEGER,
      role: v.role,
    }));

    const result = await this.storage.createUpload({
      uploadGroupId,
      purpose: request.purpose,
      variants: variantSpecs,
      now,
      expiresAt,
    });

    const pendingVariants: PendingUploadVariant[] = result.capabilities.map((cap, i) => ({
      mimeType: cap.mimeType,
      role: cap.role,
      storageKey: cap.storageKey,
      expectedSize: variantSpecs[i]!.byteSize,
      maxBytes: variantSpecs[i]!.maxBytes,
    }));

    const record: PendingUploadRecord = {
      purpose: request.purpose,
      variants: pendingVariants,
      alt: request.alt,
      caption: request.caption,
      expiresAt: result.expiresAt,
      createdAt: now,
    };

    await this.kv.put(
      `${PENDING_UPLOAD_KV_PREFIX}${result.uploadGroupId}`,
      JSON.stringify(record),
      { expirationTtl: PENDING_UPLOAD_KV_TTL_SECONDS },
    );

    return {
      uploadGroupId: result.uploadGroupId,
      capabilities: result.capabilities.map((cap) => ({
        mimeType: cap.mimeType,
        role: cap.role,
        method: cap.method,
        uploadUrl: cap.uploadUrl,
        requiredHeaders: cap.requiredHeaders,
      })),
      expiresAt: result.expiresAt,
    };
  }

  private assertVariantsCoverPolicy(
    opPath: string,
    request: CreateMediaUploadRequest,
    policy: MediaPurposePolicy,
  ): void {
    const supplied = request.variants.map((v) => v.mimeType);
    const missing = policy.required.filter((m) => !supplied.includes(m));
    if (missing.length > 0) {
      throw new DiagnosticError(
        mediaVariantsIncompleteDiagnostic(opPath, policy.name, policy.required, supplied),
      );
    }
    const roles = request.variants.map((v) => v.role);
    if (!roles.includes("primary")) {
      throw new DiagnosticError(
        mediaVariantsIncompleteDiagnostic(opPath, policy.name, policy.required, supplied),
      );
    }
  }

  private assertEachVariantAccepted(
    opPath: string,
    request: CreateMediaUploadRequest,
  ): void {
    for (const v of request.variants) {
      if (v.mimeType === MEDIA_SVG_MIME && !this.opts.allowSvg) {
        throw new DiagnosticError(mediaSvgRejectedDiagnostic(opPath));
      }
      if (!isAllowedMime(v.mimeType, this.opts.allowSvg)) {
        throw new DiagnosticError(mediaMimeRejectedDiagnostic(opPath, v.mimeType));
      }
    }
  }

  private assertNoSuspiciousSizing(
    opPath: string,
    request: CreateMediaUploadRequest,
  ): void {
    const fallback = pickFallbackForSizing(request.variants);
    if (!fallback) return;
    for (const v of request.variants) {
      if (v === fallback) continue;
      if (!MODERN_FORMATS.has(v.mimeType)) continue;
      if (v.byteSize > fallback.byteSize) {
        throw new DiagnosticError(
          mediaVariantsSuspiciousSizeDiagnostic(
            opPath,
            `${v.mimeType} (${v.byteSize}B) > ${fallback.mimeType} (${fallback.byteSize}B)`,
          ),
        );
      }
    }
  }
}

/** Modern formats that, by convention, should be smaller than the
 *  universal fallback (jpeg / png). Used by the "suspicious sizing"
 *  heuristic — if any of these weigh more than the fallback, the
 *  uploader almost certainly skipped optimization. */
const MODERN_FORMATS = new Set(["image/avif", "image/webp"]);

/** Pick the variant to compare modern formats against — preferred
 *  order: jpeg → png → gif. Returns undefined when none of the
 *  classic-format variants are present (e.g. an avif-only upload),
 *  in which case the heuristic skips. */
function pickFallbackForSizing(
  variants: readonly CreateMediaUploadVariantRequest[],
): CreateMediaUploadVariantRequest | undefined {
  for (const mime of ["image/jpeg", "image/png", "image/gif"]) {
    const found = variants.find((v) => v.mimeType === mime);
    if (found) return found;
  }
  return undefined;
}

