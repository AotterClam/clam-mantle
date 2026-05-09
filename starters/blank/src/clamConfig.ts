import {
  AssetsAssetServer,
  D1DatabaseDriver,
  KvCacheBinding,
  type Auth,
  type CmsConfig,
} from "@aotterclam/clam-cms-cloudflare";
import { buildHandlers } from "./handlers/index.js";
import { loadManifests } from "./loadManifests.js";

export interface Env {
  readonly DB: D1Database;
  readonly KV: KVNamespace;
  readonly ASSETS?: Fetcher;
  readonly GITHUB_CLIENT_ID?: string;
  readonly GITHUB_CLIENT_SECRET?: string;
  readonly ADMIN_GITHUB_LOGIN?: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly PUBLIC_ORIGIN?: string;
}

export function buildCmsConfig(env: Env, auth: Auth): CmsConfig {
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
      assets: env.ASSETS
        ? new AssetsAssetServer(env.ASSETS)
        : { fetch: async () => null },
    },
    auth,
  };
}
