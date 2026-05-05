import {
  AssetsAssetServer,
  D1DatabaseDriver,
  D1SessionRepository,
  D1StaffRepository,
  D1UserRepository,
  KvCacheBinding,
  StubOAuthVerifier,
  type CmsConfig,
} from "@aotterclam/clam-cms-cloudflare";
import { buildHandlers } from "./handlers/index.js";
import { loadManifests } from "./loadManifests.js";

export interface Env {
  readonly DB: D1Database;
  readonly KV: KVNamespace;
  readonly ASSETS?: Fetcher;
  readonly CLAM_ALLOW_STUB_OAUTH?: string;
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
      brand: "Clam Blank",
      title: "Clam Blank",
      description: "Headless CMS — bring your own frontend.",
      origin: "https://example.com",
      locales: ["en"],
    },
    bindings: {
      db: new D1DatabaseDriver(env.DB),
      kv: new KvCacheBinding(env.KV),
      sessions: new D1SessionRepository(env.DB),
      users: new D1UserRepository(env.DB),
      staff: new D1StaffRepository(env.DB),
      assets: env.ASSETS
        ? new AssetsAssetServer(env.ASSETS)
        : { fetch: async () => null },
      oauth: new StubOAuthVerifier({ CLAM_ALLOW_STUB_OAUTH: env.CLAM_ALLOW_STUB_OAUTH }),
    },
  };
}
