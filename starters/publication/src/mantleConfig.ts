import {
  AssetsAssetServer,
  D1DatabaseDriver,
  KvCacheBinding,
  type Auth,
  type CmsConfig,
} from "@aotter/mantle-cloudflare";
import { buildHandlers } from "./handlers/index.js";
import { loadManifests } from "./loadManifests.js";
import { PUBLIC_PATH_RESOLVER } from "./paths.js";
import { buildTemplates } from "./theme.default/templates/index.js";

export interface Env {
  readonly DB: D1Database;
  readonly KV: KVNamespace;
  readonly ASSETS?: Fetcher;
  /** GitHub OAuth App client_id — provision at github.com/settings/developers. */
  readonly GITHUB_CLIENT_ID?: string;
  /** GitHub OAuth App client_secret. `wrangler secret put GITHUB_CLIENT_SECRET`. */
  readonly GITHUB_CLIENT_SECRET?: string;
  /** GitHub login that auto-promotes to `owner` on first sign-in (case-insensitive). */
  readonly ADMIN_GITHUB_LOGIN?: string;
  /** 32+ random bytes; `wrangler secret put BETTER_AUTH_SECRET`. */
  readonly BETTER_AUTH_SECRET: string;
  /** Deployed Worker origin (dev: `http://localhost:8787`). */
  readonly PUBLIC_ORIGIN?: string;
  /** Public — embedded in the contact form widget. wrangler.toml
   *  ships CF's "always passes" test key as the dev default. */
  readonly TURNSTILE_SITE_KEY?: string;
  /** Server-side — verifies the token client-side widget produces.
   *  `dev-stub` short-circuits; any other value triggers real
   *  siteverify (`wrangler secret put TURNSTILE_SECRET_KEY`). */
  readonly TURNSTILE_SECRET_KEY?: string;
  /** Local-dev live-render flag. `1` bypasses KV for post / postList
   *  / page routes — every request re-renders via the registered
   *  templates against the current D1 state. Don't set in production. */
  readonly MANTLE_LOCAL_DEV?: string;
}

export function buildCmsConfig(env: Env, auth: Auth): CmsConfig {
  return {
    manifests: loadManifests(),
    handlers: buildHandlers(env),
    templates: buildTemplates(),
    siteDefaults: {
      brand: "Mantle Publication",
      title: "Mantle Publication",
      description: "Reference starter for mantle — localized posts + contact form.",
      origin: "https://example.com",
      locales: ["en", "zh-TW"],
    },
    publicPathResolver: PUBLIC_PATH_RESOLVER,
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
