/**
 * Optional first-party media storage — **public bucket only**. Not
 * part of the required v0.1.0 provisioning path: starters must keep
 * working without an implementation.
 *
 * # Multi-variant by default (#272)
 *
 * Every committed `MediaAsset` carries one or more `variants` — at
 * minimum the format `<img>` falls back to (`role: "primary"`), and
 * typically additional formats (`webp`, `avif`) the renderer prefers
 * via `<picture>`. Variant *bytes* are produced agent-side by
 * `@aotter/mantle-media-tools` (sharp / libvips); the Worker only
 * receives already-processed uploads and enforces policy. workerd
 * has no usable image-processing stack — pushing optimization onto
 * the agent sidesteps that entirely.
 *
 * # Scope: public bucket only
 *
 * `getPublicUrl()` returns an unconditional public URL; reads bypass
 * the Worker (`MEDIA_PUBLIC_URL_BASE` → CDN → R2). Each variant's
 * `publicUrl` is frozen at commit time. The asset is persisted to the
 * `media_assets` table by the commit use case; entries reference it
 * by `MediaAsset.id` (`x-mantle-ref: media_assets`) and the renderer
 * calls `runtime.media.resolve(id)` to materialise the full variants
 * set at render time.
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
  /** Issue presigned direct-upload capabilities for every declared
   *  variant of one logical asset. The adapter mints storage keys
   *  (typically under a shared `<uploadGroupId>/` prefix) and signs a
   *  PUT URL per variant. */
  createUpload(args: CreateUploadArgs): Promise<CreateUploadResult>;

  /** Commit a previously-PUT variant bundle. The adapter HEADs every
   *  storageKey, verifies actual mime + bytes, and returns a fully
   *  populated `MediaAsset` — the use case then persists it to the
   *  `media_assets` table via `MediaAssetRepository.save`. All-or-
   *  nothing: any variant failing verification rejects the whole
   *  commit. */
  commitUpload(args: CommitUploadArgs): Promise<MediaAsset>;

  /** Resolve the stable public URL for a single stored object by
   *  storageKey. Used by adapter internals and the orphan sweeper
   *  (#254); render paths read URLs straight off `MediaAsset.variants`
   *  rather than calling this per request. */
  getPublicUrl(args: GetPublicUrlArgs): Promise<string>;

  /** Delete a single stored object. The use-case-level deletion path
   *  orchestrates "lookup by asset id → delete every variant object →
   *  delete media_assets row" by calling this once per variant. */
  deleteObject(args: DeleteObjectArgs): Promise<void>;

  /** Server-side variant byte write — the sandboxed-agent alternative
   *  to the presigned-PUT path produced by `createUpload`. Used by
   *  the `upload_media_variant` MCP tool when the caller cannot reach
   *  the storage backend directly (e.g. Claude Cowork agents — the
   *  outbound proxy doesn't allowlist R2 hosts). The adapter writes
   *  via its privileged binding (R2 binding for Cloudflare; AWS SDK
   *  PUT for a future S3 adapter; etc.) with no signed URL involved.
   *
   *  The storage-key layout matches what `createUpload` would have
   *  produced for the same `(uploadGroupId, purpose, role, mimeType)`
   *  so `commitUpload`'s HEAD-verify still resolves the right object
   *  regardless of which path the bytes arrived on.
   *
   *  Every adapter MUST implement this method (the interface is
   *  required-shaped, not optional). Adapters without a privileged
   *  write path implement it as a thrower — typically raising
   *  `DiagnosticError(MEDIA_NOT_CONFIGURED)` so the use case surfaces
   *  the failure with the expected diagnostic shape. */
  putVariantBytes(args: PutVariantBytesArgs): Promise<PutVariantBytesResult>;
}

export interface PutVariantBytesArgs {
  /** Logical asset id — matches the same group's `createUpload`. */
  readonly uploadGroupId: string;
  /** Drives the storage-key prefix. Must match the pending upload's
   *  declared purpose. */
  readonly purpose: string;
  readonly role: MediaVariantRole;
  readonly mimeType: string;
  /** Original filename — preserved on the stored object's metadata
   *  alongside the variant role + group id, matching createUpload's
   *  customMetadata shape so commit's HEAD-verify reads the same
   *  fields whether the bytes arrived via presigned PUT or via this
   *  server-side path. */
  readonly filename: string;
  readonly bytes: Uint8Array;
}

export interface PutVariantBytesResult {
  /** Adapter-minted storage key. Use-case persists this back into the
   *  matching `PendingUploadVariant` so commit verifies the right
   *  object. */
  readonly storageKey: string;
}

/** Variant role within a logical asset.
 *
 * - `primary` — the `<img>` / fallback rendering. Every asset has
 *   exactly one. Conventionally jpeg / png (universal browser support).
 * - `alternate` — additional format candidates the renderer prefers
 *   via `<picture><source>`. Modern formats (avif, webp).
 * - `fallback` — reserved for future use (e.g. very-small thumbnail
 *   for above-the-fold inlining). Not currently emitted by the
 *   `media-tools` agent script.
 */
export type MediaVariantRole = "primary" | "alternate" | "fallback";

export interface CreateUploadArgs {
  /** Logical asset id — also the future `MediaAsset.id`. Minted by
   *  the use case via `IdGenerator`; the adapter uses it as the
   *  storage-key prefix so every variant of one asset lives under a
   *  common path. */
  readonly uploadGroupId: string;
  readonly purpose: string;
  /** Original filename — stamped into each variant's customMetadata
   *  at commit time. Storage keys remain server-generated; the
   *  filename is purely for operator visibility in R2 / S3 dashboards
   *  and for renderers that want to recover a download name. */
  readonly filename: string;
  readonly variants: ReadonlyArray<CreateUploadVariantSpec>;
  readonly now: number;
  readonly expiresAt: number;
  /** Optional opaque metadata the adapter may stamp onto the stored
   *  objects (e.g. customer tag, deployment env). Not interpreted. */
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CreateUploadVariantSpec {
  readonly mimeType: string;
  /** Caller-declared payload size. The use case already verified it
   *  satisfies `maxBytes`; passed through so the adapter can forward
   *  it as a Content-Length hint where the backend supports one. */
  readonly byteSize: number;
  /** Per-mime cap, sourced from `siteDefaults.media.purposes[name].maxBytes`. */
  readonly maxBytes: number;
  readonly role: MediaVariantRole;
}

export interface CreateUploadResult {
  readonly uploadGroupId: string;
  readonly capabilities: ReadonlyArray<UploadCapability>;
  readonly expiresAt: number;
}

export interface UploadCapability {
  readonly mimeType: string;
  readonly role: MediaVariantRole;
  readonly method: "PUT";
  readonly uploadUrl: string;
  readonly storageKey: string;
  readonly publicUrl: string;
  readonly requiredHeaders?: Readonly<Record<string, string>>;
}

/**
 * Adapter contract: for each variant, before populating the returned
 * `MediaAsset`, verify the stored object's actual content-type
 * matches `mimeType` and actual byte size ≤ `maxBytes`. Any failure
 * rejects the whole bundle with `DiagnosticError(MEDIA_MIME_REJECTED)`
 * or `MEDIA_VARIANT_SIZE_EXCEEDED`. Without adapter-side verification,
 * a caller can declare `image/png` and PUT a PDF.
 */
export interface CommitUploadArgs {
  readonly uploadGroupId: string;
  /** Original filename forwarded from the create-time call; adapter
   *  stamps it into each variant's customMetadata so operator
   *  dashboards see the human-meaningful name alongside the
   *  server-generated storage key. */
  readonly filename: string;
  readonly variants: ReadonlyArray<CommitUploadVariantSpec>;
  readonly alt?: string;
  readonly caption?: string;
  readonly now: number;
}

export interface CommitUploadVariantSpec {
  readonly mimeType: string;
  readonly role: MediaVariantRole;
  readonly storageKey: string;
  readonly maxBytes: number;
}

export interface GetPublicUrlArgs {
  readonly storageKey: string;
}

export interface DeleteObjectArgs {
  readonly storageKey: string;
}

/**
 * Committed asset — what `commitUpload` returns and what the
 * `media_assets` table persists. Renderers consume `variants`
 * directly; `<picture>` emits one `<source>` per non-primary
 * variant with `<img>` falling back to the primary one. There is
 * no top-level `publicUrl` — that single-URL world is what
 * #272 replaces.
 */
export interface MediaAsset {
  readonly id: string;
  readonly variants: ReadonlyArray<MediaVariant>;
  readonly alt?: string;
  readonly caption?: string;
  readonly createdAt: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface MediaVariant {
  readonly mimeType: string;
  readonly publicUrl: string;
  readonly storageKey: string;
  readonly byteSize: number;
  readonly role: MediaVariantRole;
}

/** Pick the primary variant (the one `<img>` falls back to). Helper
 *  for renderers / SSR that want one URL when they don't care about
 *  the full `<picture>` form. Throws if the asset has no primary —
 *  the use case rejects commits in that shape, so a runtime-reachable
 *  asset always has one. */
export function pickPrimaryVariant(asset: MediaAsset): MediaVariant {
  const primary = asset.variants.find((v) => v.role === "primary");
  if (!primary) {
    throw new Error(
      `MediaAsset ${asset.id} has no primary variant — commit invariant violated`,
    );
  }
  return primary;
}
