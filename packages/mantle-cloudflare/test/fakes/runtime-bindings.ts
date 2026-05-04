import type {
  AssetServer,
  KvCache,
  KvListResult,
  KvPutOptions,
  Session,
  SessionRepository,
} from "@aotter/mantle-runtime";

/**
 * Stub bindings for the smoke test. We re-use the runtime's
 * `InMemoryDatabase` for `DatabaseDriver` (already battle-tested) and
 * supply minimal stand-ins for the four other ports — they aren't on
 * the form-submission hot path. `OAuthVerifier` comes from
 * `src/bindings/StubOAuthVerifier` (re-exported as part of the public
 * API; constructed with the dev-only env flag).
 */
export class InMemoryKv implements KvCache {
  private store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string, _opts?: KvPutOptions): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  async list(prefix: string): Promise<KvListResult> {
    return {
      keys: [...this.store.keys()].filter((k) => k.startsWith(prefix)),
      cursor: null,
    };
  }
}

export class StubSessionRepository implements SessionRepository {
  private sessions = new Map<string, Session>();
  async read(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }
  async write(session: Session): Promise<void> {
    this.sessions.set(session.token, session);
  }
  async invalidate(token: string): Promise<void> {
    this.sessions.delete(token);
  }
}

export class StubAssetServer implements AssetServer {
  async fetch(_req: Request): Promise<Response | null> {
    return null;
  }
}
