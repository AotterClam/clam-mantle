/**
 * Optional first-party media storage. Not part of the required v0.1.0
 * provisioning path: starters must keep working without an implementation.
 *
 * The port is intentionally object-storage-shaped. Cloudflare R2, S3,
 * filesystem, or a future hosted service can implement it without leaking
 * adapter types into runtime use cases.
 */
export interface MediaStorage {
  /** Create a short-lived direct-upload capability for a single object. */
  createUpload(input: CreateMediaUploadRequest): Promise<CreateMediaUploadResponse>;

  /** Commit a previously-uploaded object after adapter metadata checks. */
  commitUpload(input: CommitMediaUploadRequest): Promise<MediaAsset>;

  /** Store bytes fetched by a trusted ingestion use case, e.g. URL import. */
  putObject(input: PutMediaObjectRequest): Promise<MediaAsset>;

  /** Resolve the stable public URL for an already committed asset. */
  getPublicUrl(input: GetMediaPublicUrlRequest): Promise<string>;

  deleteAsset(input: DeleteMediaAssetRequest): Promise<void>;
}

export interface CreateMediaUploadRequest {
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize?: number;
  readonly maxBytes: number;
  readonly purpose?: string;
  readonly now: number;
  readonly expiresAt: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CreateMediaUploadResponse {
  readonly uploadId: string;
  readonly method: "PUT";
  readonly uploadUrl: string;
  readonly storageKey: string;
  readonly expiresAt: number;
  readonly requiredHeaders?: Readonly<Record<string, string>>;
  /** Optional preview of the eventual public URL. Commit remains authoritative. */
  readonly publicUrl?: string;
}

export interface CommitMediaUploadRequest {
  readonly uploadId: string;
  readonly storageKey: string;
  readonly expectedMimeType: string;
  readonly maxBytes: number;
  readonly alt?: string;
  readonly caption?: string;
  readonly checksum?: string;
  readonly now: number;
}

export interface PutMediaObjectRequest {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly alt?: string;
  readonly caption?: string;
  readonly purpose?: string;
  readonly now: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface GetMediaPublicUrlRequest {
  readonly assetId: string;
  readonly storageKey: string;
}

export interface DeleteMediaAssetRequest {
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
