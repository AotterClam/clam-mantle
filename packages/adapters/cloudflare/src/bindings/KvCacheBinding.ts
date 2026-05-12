import type { KvCache, KvListResult, KvPutOptions } from "@aotter/mantle-runtime";

/**
 * `KvCache` impl wrapping Cloudflare Workers KV. Pure pass-through —
 * the port shape is a strict subset of the KV namespace API.
 */
export class KvCacheBinding implements KvCache {
  constructor(private readonly kv: KVNamespace) {}

  get(key: string): Promise<string | null> {
    return this.kv.get(key, "text");
  }

  put(key: string, value: string, opts?: KvPutOptions): Promise<void> {
    return this.kv.put(key, value, opts ? { expirationTtl: opts.expirationTtl } : undefined);
  }

  delete(key: string): Promise<void> {
    return this.kv.delete(key);
  }

  async list(prefix: string, cursor?: string | null): Promise<KvListResult> {
    const r = await this.kv.list({ prefix, cursor: cursor ?? undefined });
    return {
      keys: r.keys.map((k) => k.name),
      cursor: r.list_complete ? null : r.cursor ?? null,
    };
  }
}
