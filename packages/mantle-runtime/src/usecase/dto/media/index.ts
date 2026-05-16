/**
 * Media use-case DTOs. Distinct from `MediaStorage` port request types:
 * the use case receives caller-supplied fields, derives the rest
 * (storageKey via the adapter, expiresAt via the clock, maxBytes via
 * adapter config), and forwards a port-shaped request internally.
 */

export interface CreateMediaUploadRequest {
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize?: number;
  readonly alt?: string;
  readonly caption?: string;
  readonly purpose?: string;
}

export interface CreateMediaUploadResponse {
  readonly uploadId: string;
  readonly uploadUrl: string;
  readonly method: "PUT";
  readonly requiredHeaders?: Readonly<Record<string, string>>;
  readonly expiresAt: number;
}

export interface CommitMediaUploadRequest {
  readonly uploadId: string;
  readonly alt?: string;
  readonly caption?: string;
  readonly checksum?: string;
}
