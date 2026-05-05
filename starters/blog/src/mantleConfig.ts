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
import { buildTemplates } from "./templates/index.js";

/**
 * `Env` shape. Wrangler typegen would normally produce this — for the
 * starter we hand-author it to keep dependencies thin.
 */
export interface Env {
  readonly DB: D1Database;
  readonly KV: KVNamespace;
  readonly ASSETS?: Fetcher;
  readonly MANTLE_ALLOW_STUB_OAUTH?: string;
  /** Public — embedded in the contact form widget. wrangler.toml
   *  ships CF's "always passes" test key as the dev default. */
  readonly TURNSTILE_SITE_KEY?: string;
  /** Server-side — verifies the token client-side widget produces.
   *  `dev-stub` short-circuits to a literal-string check; any other
   *  value triggers real siteverify (provision via
   *  `wrangler secret put TURNSTILE_SECRET_KEY`). */
  readonly TURNSTILE_SECRET_KEY?: string;
}

/**
 * Build the per-isolate `CmsConfig` from the worker's `env` bindings.
 * The starter calls this once at module-init time inside `index.ts`
 * (under the `let runtimeRef` guard) so the runtime + decorator
 * chain is built once per isolate.
 */
export function buildCmsConfig(env: Env): CmsConfig {
  return {
    manifests: loadManifests(),
    handlers: buildHandlers(env),
    templates: buildTemplates(),
    siteDefaults: {
      brand: "Mantle Blog",
      title: "Mantle Blog",
      description: "Reference starter for mantle — localized posts + contact form.",
      origin: "https://example.com",
      locales: ["en", "zh-TW"],
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
