import { AwsClient } from "aws4fetch";
import { DiagnosticError, makeDiagnostic } from "@aotter/mantle-spec";
import {
  RandomUuidGenerator,
  extensionForMime,
  type CommitUploadArgs,
  type CreateUploadArgs,
  type CreateUploadResult,
  type DeleteAssetArgs,
  type GetPublicUrlArgs,
  type IdGenerator,
  type MediaAsset,
  type MediaStorage,
} from "@aotter/mantle-runtime";

/**
 * `R2MediaStorage` — `MediaStorage` adapter backed by Cloudflare R2,
 * **public bucket only**.
 *
 * The bound R2 bucket is expected to have public access enabled and
 * (typically) a custom domain or `pub-<hash>.r2.dev` URL pointing at
 * it. Reads bypass the Worker entirely. CORS on the bucket should be
 * scoped to the admin SPA origin so browser direct PUTs work without
 * exposing other origins.
 *
 * Two access modes — both required:
 *   - `bucket` (`R2Bucket` binding) — server-side `get` / `put` /
 *     `delete`. Used at commit-time to read uploaded-object metadata
 *     and rewrite it with `committedAt`, and to clean up failed
 *     uploads.
 *   - `s3` (`AwsClient` from `aws4fetch`) — SigV4 presigned PUT URL
 *     generation. The R2 binding cannot issue presigned URLs.
 *
 * Public URL resolution is fully consumer-supplied via `publicBase`.
 * The hash in `pub-<hash>.r2.dev` is opaque (assigned only after the
 * user enables public access on the bucket); custom domains are
 * configured separately. Adapters never derive the public URL from
 * account / bucket — the consumer must wire it through the `cmsConfig`
 * env (typically `MEDIA_PUBLIC_URL_BASE`).
 *
 * # Future: private bucket adapter
 *
 * A v0.2 `R2PrivateMediaStorage` will live alongside this class and
 * implement a separate `PrivateMediaStorage` port. It binds a
 * different R2 bucket — public access disabled — and routes every
 * read through a Worker policy gate (staff / subscription check)
 * before streaming via `bucket.get()` or 302-ing to a short-lived
 * signed GET. **Two buckets, two ports**, by design — see ADR-0011
 * § "Public vs private media — two buckets, two ports". Don't bolt
 * a `visibility` flag onto this class to handle private content.
 */
export class R2MediaStorage implements MediaStorage {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly s3: AwsClient,
    /** S3 endpoint for THIS bucket — must include the bucket as the
     *  subdomain, e.g. `https://<bucket>.<account>.r2.cloudflarestorage.com`.
     *  Used as the host for presigned PUT URLs. */
    private readonly s3Endpoint: string,
    /** Public read-base URL — `https://media.example.com` (custom
     *  domain) or `https://pub-<hash>.r2.dev` (R2 public dev domain).
     *  Trailing slash is normalised away. */
    publicBase: string,
    /** ID source for `uploadId` and the random portion of `storageKey`.
     *  Defaults to `RandomUuidGenerator`; tests inject a deterministic
     *  fake to assert exact key strings. **Production must use a
     *  CSPRNG-backed generator** — `uploadId` is bearer-token-equivalent
     *  and a predictable storageKey leaks pre-commit object locations.
     *  See `IdGenerator`'s "Security invariant". */
    private readonly idgen: IdGenerator = RandomUuidGenerator,
  ) {
    if (!publicBase) {
      throw new DiagnosticError(
        makeDiagnostic({
          code: "MEDIA_NOT_CONFIGURED",
          phase: "runtime",
          severity: "error",
          path: "adapter/R2MediaStorage",
          expected: "publicBase URL (set MEDIA_PUBLIC_URL_BASE)",
        }),
      );
    }
    this.publicBase = publicBase.replace(/\/+$/, "");
  }

  private readonly publicBase: string;

  async createUpload(args: CreateUploadArgs): Promise<CreateUploadResult> {
    const uploadId = this.idgen.next();
    const storageKey = this.buildStorageKey(args.mimeType, args.purpose);
    const ttlSeconds = Math.max(60, Math.floor((args.expiresAt - args.now) / 1000));

    // Sign-as-query: PUT URL with the SigV4 signature in the query
    // string. Browsers / agents PUT to this URL and we don't ask
    // them to mint signing headers.
    //
    // Why sign nothing else: pinning Content-Type into the signature
    // forces clients to send EXACTLY that header — browsers will
    // strip mismatches and produce 403s. Pinning Content-Length is
    // pointless because it's a forbidden header. The signature
    // already constrains key + method + expiry; mime + size + etag
    // are re-verified at commit-time via `bucket.get`.
    const target = new URL(`${this.s3Endpoint.replace(/\/+$/, "")}/${storageKey}`);
    target.searchParams.set("X-Amz-Expires", String(ttlSeconds));
    const signed = await this.s3.sign(target.toString(), {
      method: "PUT",
      aws: { signQuery: true, service: "s3" },
    });

    return {
      uploadId,
      method: "PUT",
      uploadUrl: signed.url,
      storageKey,
      expiresAt: args.expiresAt,
      requiredHeaders: { "Content-Type": args.mimeType },
      publicUrl: `${this.publicBase}/${storageKey}`,
    };
  }

  async commitUpload(args: CommitUploadArgs): Promise<MediaAsset> {
    // Single `get` covers existence + metadata + body stream for the
    // metadata-rewrite PUT. R2 has no metadata-only patch; the PUT
    // streams `existing.body` (a ReadableStream) back without
    // materialising bytes in Worker memory.
    const existing = await this.bucket.get(args.storageKey);
    if (!existing) throw mediaDiagnostic("MEDIA_OBJECT_NOT_FOUND", { value: args.uploadId });

    const actualMime = existing.httpMetadata?.contentType ?? "application/octet-stream";
    if (args.checksum && existing.etag && existing.etag.replace(/^"|"$/g, "") !== args.checksum) {
      throw mediaDiagnostic("MEDIA_CHECKSUM_MISMATCH", {
        value: existing.etag,
        expected: args.checksum,
      });
    }
    if (actualMime !== args.expectedMimeType) {
      throw mediaDiagnostic("MEDIA_MIME_REJECTED", {
        value: actualMime,
        expected: args.expectedMimeType,
      });
    }
    if (existing.size > args.maxBytes) {
      throw mediaDiagnostic("MEDIA_SIZE_EXCEEDED", {
        value: existing.size,
        expected: `<= ${args.maxBytes}`,
      });
    }

    const customMetadata: Record<string, string> = {
      ...existing.customMetadata,
      committedAt: String(args.now),
    };
    if (args.alt) customMetadata["alt"] = args.alt;
    if (args.caption) customMetadata["caption"] = args.caption;

    await this.bucket.put(args.storageKey, existing.body, {
      httpMetadata: { contentType: actualMime },
      customMetadata,
    });

    return {
      id: args.uploadId,
      storageKey: args.storageKey,
      publicUrl: `${this.publicBase}/${args.storageKey}`,
      mimeType: actualMime,
      byteSize: existing.size,
      alt: args.alt,
      caption: args.caption,
      createdAt: args.now,
      metadata: customMetadata,
    };
  }

  async getPublicUrl(args: GetPublicUrlArgs): Promise<string> {
    return `${this.publicBase}/${args.storageKey}`;
  }

  async deleteAsset(args: DeleteAssetArgs): Promise<void> {
    await this.bucket.delete(args.storageKey);
  }

  /** Object keys are server-generated. The mime-derived extension is
   *  purely cosmetic — server-side serving never infers content-type
   *  from the key. Purpose, when supplied, becomes a dir-prefix so an
   *  operator can eyeball "post-cover/abc123.jpg" in R2 dashboards. */
  private buildStorageKey(mimeType: string, purpose?: string): string {
    const id = this.idgen.next();
    const ext = extensionForMime(mimeType);
    const prefix = purpose && /^[a-z0-9-]+$/.test(purpose) ? `${purpose}/` : "";
    return `${prefix}${id}.${ext}`;
  }
}

function mediaDiagnostic(
  code:
    | "MEDIA_OBJECT_NOT_FOUND"
    | "MEDIA_MIME_REJECTED"
    | "MEDIA_SIZE_EXCEEDED"
    | "MEDIA_CHECKSUM_MISMATCH",
  fields: { value: unknown; expected?: string },
): DiagnosticError {
  return new DiagnosticError(
    makeDiagnostic({
      code,
      phase: "runtime",
      severity: "error",
      path: "adapter/R2MediaStorage/commitUpload",
      ...fields,
    }),
  );
}
