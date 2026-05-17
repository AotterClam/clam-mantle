/**
 * Optional first-party media storage — **public bucket only**. Not
 * part of the required v0.1.0 provisioning path: starters must keep
 * working without an implementation.
 *
 * The port is intentionally object-storage-shaped. Cloudflare R2, S3,
 * filesystem, or a future hosted service can implement it without
 * leaking adapter types into runtime use cases.
 *
 * # Scope: public bucket only
 *
 * `getPublicUrl()` returns an unconditional public URL; reads bypass
 * the Worker (`MEDIA_PUBLIC_URL_BASE` → CDN → R2). `MediaAsset.publicUrl`
 * is frozen at commit time and embedded directly into entry data
 * (e.g. `posts.coverUrl`). For public assets the URL is permanent and
 * the read path stays cheap.
 *
 * **Private content (subscription-gated, fan-club, signed-GET, etc.)
 * is a separate port + separate R2 bucket in v0.2** — see ADR-0011
 * § "Public vs private media — two buckets, two ports". The private
 * port will live alongside this one (`PrivateMediaStorage`); current
 * callers stay untouched. Don't bolt a `visibility` flag onto this
 * port to retrofit private semantics — that's not the seam.
 *
 * Method-arg shapes use the `*Args` suffix (matching `EntryRepository`)
 * to leave the `*Request` / `*Response` namespace for use-case DTOs in
 * `usecase/dto/media/`.
 */
export interface MediaStorage {
  /** Create a short-lived direct-upload capability for a single object. */
  createUpload(args: CreateUploadArgs): Promise<CreateUploadResult>;

  /** Commit a previously-uploaded object after adapter metadata checks. */
  commitUpload(args: CommitUploadArgs): Promise<MediaAsset>;

  /** Resolve the stable public URL for an already committed asset. */
  getPublicUrl(args: GetPublicUrlArgs): Promise<string>;

  deleteAsset(args: DeleteAssetArgs): Promise<void>;
}

export interface CreateUploadArgs {
  readonly filename: string;
  readonly mimeType: string;
  /** Already checked against `maxBytes` by the use case. Adapters may
   *  forward it as a `Content-Length` constraint when the backend
   *  supports it. */
  readonly byteSize: number;
  readonly maxBytes: number;
  readonly purpose?: string;
  readonly now: number;
  readonly expiresAt: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CreateUploadResult {
  readonly uploadId: string;
  readonly method: "PUT";
  readonly uploadUrl: string;
  readonly storageKey: string;
  readonly expiresAt: number;
  readonly requiredHeaders?: Readonly<Record<string, string>>;
  /** Optional preview of the eventual public URL. Commit remains authoritative. */
  readonly publicUrl?: string;
}

/**
 * Adapter contract: before returning `MediaAsset`, verify the stored
 * object's actual content-type against `expectedMimeType` and actual
 * byte size against `maxBytes`. The use case only validates caller-
 * declared MIME, not the bytes that landed in storage — without
 * adapter-side verification, a caller can declare `image/png` and PUT
 * a PDF. Mismatch → throw `DiagnosticError(MEDIA_MIME_REJECTED)` or
 * `MEDIA_SIZE_EXCEEDED`. (Use whichever metadata primitive the
 * backend exposes: R2 / S3 `head()`, filesystem `stat()`.)
 */
export interface CommitUploadArgs {
  readonly uploadId: string;
  readonly storageKey: string;
  /** Adapter must verify stored object's actual content-type matches. */
  readonly expectedMimeType: string;
  /** Adapter must verify stored object's actual byte size ≤ this. */
  readonly maxBytes: number;
  readonly alt?: string;
  readonly caption?: string;
  readonly checksum?: string;
  readonly now: number;
}

export interface GetPublicUrlArgs {
  readonly assetId: string;
  readonly storageKey: string;
}

export interface DeleteAssetArgs {
  readonly assetId: string;
  readonly storageKey: string;
}

export interface MediaAsset {
  readonly id: string;
  readonly storageKey: string;
  readonly publicUrl: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly alt?: string;
  readonly caption?: string;
  readonly createdAt: number;
  readonly metadata?: Readonly<Record<string, string>>;
}
