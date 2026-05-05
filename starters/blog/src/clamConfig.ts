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
import { PUBLIC_PATH_RESOLVER } from "./paths.js";
import { buildTemplates } from "./theme.default/templates/index.js";

/**
 * `Env` shape. Wrangler typegen would normally produce this — for the
 * starter we hand-author it to keep dependencies thin.
 */
export interface Env {
  readonly DB: D1Database;
  readonly KV: KVNamespace;
  readonly ASSETS?: Fetcher;
  readonly CLAM_ALLOW_STUB_OAUTH?: string;
  /** Public — embedded in the contact form widget. wrangler.toml
   *  ships CF's "always passes" test key as the dev default. */
  readonly TURNSTILE_SITE_KEY?: string;
  /** Server-side — verifies the token client-side widget produces.
   *  `dev-stub` short-circuits to a literal-string check; any other
   *  value triggers real siteverify (provision via
   *  `wrangler secret put TURNSTILE_SECRET_KEY`). */
  readonly TURNSTILE_SECRET_KEY?: string;
  /** Local-dev live-render flag. `1` bypasses KV for post / postList
   *  / page routes — every request re-renders via the registered
   *  templates against the current D1 state. Lets you edit shared
   *  chrome (Header / Layout / styles / i18n) and see the change on
   *  every page immediately, no `pnpm fixture` rebake. Don't set in
   *  production — defeats the publish pipeline's KV cache. */
  readonly CLAM_LOCAL_DEV?: string;
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
      brand: "Clam Blog",
      title: "Clam Blog",
      description: "Reference starter for clam-cms — localized posts + contact form.",
      origin: "https://example.com",
      locales: ["en", "zh-TW"],
    },
    publicPathResolver: PUBLIC_PATH_RESOLVER,
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
