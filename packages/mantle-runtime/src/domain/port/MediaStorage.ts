/**
 * Optional first-party media storage. Not part of the required v0.1.0
 * provisioning path: starters must keep working without an implementation.
 *
 * The port is intentionally object-storage-shaped. Cloudflare R2, S3,
 * filesystem, or a future hosted service can implement it without leaking
 * adapter types into runtime use cases.
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
  readonly byteSize?: number;
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

export interface CommitUploadArgs {
  readonly uploadId: string;
  readonly storageKey: string;
  readonly expectedMimeType: string;
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
