/**
 * Optional remote URL ingestion seam for media imports. This is separate
 * from MediaStorage so SSRF / redirect / content-type policy does not
 * pollute the object-storage port.
 */
export interface RemoteMediaFetcher {
  fetchAllowedUrl(input: FetchAllowedUrlRequest): Promise<FetchedMedia>;
}

export interface FetchAllowedUrlRequest {
  readonly url: string;
  readonly allowedMimeTypes: readonly string[];
  readonly maxBytes: number;
  /** Default true for v0.1.x media ingestion. */
  readonly httpsOnly?: boolean;
  /** Default false; SVG remains opt-in because object storage does not sanitize. */
  readonly allowSvg?: boolean;
  readonly maxRedirects?: number;
}

export interface FetchedMedia {
  readonly finalUrl: string;
  readonly filename?: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly byteSize: number;
}
