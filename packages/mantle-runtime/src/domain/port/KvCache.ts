/**
 * `KvCache` — read-mostly cache for the publish pipeline. The runtime
 * stores pre-rendered HTML, per-locale `.md` mirrors, and `llms.txt`
 * here. Reads are on the public-content hot path; writes happen only
 * during publish / unpublish.
 *
 * CF adapter: Workers KV. Future: Redis, FS, S3-compatible store.
 *
 * Distinct from `DatabaseDriver` — KV is eventually-consistent across
 * regions (Workers KV) and tuned for high-fanout reads. The canonical
 * source of truth for entries lives in the DB; KV is a derivative
 * cache that the publish pipeline writes through.
 *
 * Renamed from `KvPort` per the clean-architecture naming convention.
 */
export interface KvCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: KvPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  /** List keys with a prefix. Used by sitemap / `llms.txt` aggregation
   *  + cache invalidation paths. Cursor is opaque; consumers loop
   *  until cursor is `null`. */
  list(prefix: string, cursor?: string | null): Promise<KvListResult>;
}

export interface KvPutOptions {
  /** Seconds until the entry expires. Adapters that don't support
   *  TTL silently ignore. */
  readonly expirationTtl?: number;
}

export interface KvListResult {
  readonly keys: readonly string[];
  readonly cursor: string | null;
}
