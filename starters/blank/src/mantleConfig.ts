import {
  AssetsAssetServer,
  D1DatabaseDriver,
  D1SessionRepository,
  KvCacheBinding,
  StubOAuthVerifier,
  type CmsConfig,
} from "@aotter/mantle-cloudflare";
import { buildHandlers } from "./handlers/index.js";
import { loadManifests } from "./loadManifests.js";

export interface Env {
  readonly DB: D1Database;
  readonly KV: KVNamespace;
  readonly ASSETS?: Fetcher;
  readonly MANTLE_ALLOW_STUB_OAUTH?: string;
}

/**
 * Build the per-isolate `CmsConfig` from the worker's `env` bindings.
 * No `templates` field — the headless starter renders nothing on the
 * server. Add a TemplateRegistry here only if you decide to introduce
 * server-rendered HTML later.
 */
export function buildCmsConfig(env: Env): CmsConfig {
  return {
    manifests: loadManifests(),
    handlers: buildHandlers(),
    siteDefaults: {
      brand: "Mantle Blank",
      title: "Mantle Blank",
      description: "Headless CMS — bring your own frontend.",
      origin: "https://example.com",
      locales: ["en"],
    },
    bindings: {
      db: new D1DatabaseDriver(env.DB),
      kv: new KvCacheBinding(env.KV),
      sessions: new D1SessionRepository(env.DB),
      assets: env.ASSETS
        ? new AssetsAssetServer(env.ASSETS)
        : { fetch: async () => null },
      oauth: new StubOAuthVerifier({ MANTLE_ALLOW_STUB_OAUTH: env.MANTLE_ALLOW_STUB_OAUTH }),
    },
  };
}
