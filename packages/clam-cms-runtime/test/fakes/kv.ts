import type {
  KvCache,
  KvListResult,
  KvPutOptions,
} from "../../src/domain/port/KvCache.js";

/** In-memory `KvCache` for tests. TTL is recorded but not enforced. */
export class InMemoryKv implements KvCache {
  private store = new Map<string, string>();
  private ttl = new Map<string, number | undefined>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string, opts?: KvPutOptions): Promise<void> {
    this.store.set(key, value);
    this.ttl.set(key, opts?.expirationTtl);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.ttl.delete(key);
  }

  async list(prefix: string, _cursor?: string | null): Promise<KvListResult> {
    const keys = [...this.store.keys()].filter((k) => k.startsWith(prefix));
    return { keys, cursor: null };
  }

  /** Test helper: snapshot the current store. */
  _snapshot(): ReadonlyMap<string, string> {
    return new Map(this.store);
  }
}
