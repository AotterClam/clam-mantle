import {
  AssetsAssetServer,
  D1DatabaseDriver,
  D1SessionRepository,
  D1StaffRepository,
  D1UserRepository,
  KvCacheBinding,
  StubOAuthVerifier,
  type AdminAuthConfig,
  type CmsConfig,
} from "@aotter/mantle-cloudflare";
import {
  WorkersOAuthVerifier,
  createOAuthProvider,
} from "@aotter/mantle-cloudflare/cf";
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
  /** KV namespace used by @cloudflare/workers-oauth-provider for token,
   *  grant, and client registration storage. Bind as `OAUTH_KV` in
   *  wrangler.toml. Required in production; omit in dev when using
   *  StubOAuthVerifier (MANTLE_ALLOW_STUB_OAUTH=1). */
  readonly OAUTH_KV?: KVNamespace;
  /** Dev-only flag that enables StubOAuthVerifier (accepts `Bearer dev-<id>`).
   *  Remove from wrangler.toml [vars] before deploying to production. */
  readonly MANTLE_ALLOW_STUB_OAUTH?: string;
  /** GitHub OAuth App client_id — provision at github.com/settings/developers. */
  readonly GITHUB_CLIENT_ID?: string;
  /** GitHub OAuth App client_secret. Use `wrangler secret put GITHUB_CLIENT_SECRET`. */
  readonly GITHUB_CLIENT_SECRET?: string;
  /** GitHub login that receives the `owner` staff role on first sign-in.
   *  Must match exactly — case-insensitive. Use `wrangler secret put ADMIN_GITHUB_LOGIN`. */
  readonly ADMIN_GITHUB_LOGIN?: string;
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
  readonly MANTLE_LOCAL_DEV?: string;
}

/**
 * Build the per-isolate `CmsConfig` from the worker's `env` bindings.
 * The starter calls this once at module-init time inside `index.ts`
 * (under the `let runtimeRef` guard) so the runtime + decorator
 * chain is built once per isolate.
 */
export function buildCmsConfig(env: Env): CmsConfig {
  const adminAuth = buildAdminAuth(env);
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
      oauth: env.MANTLE_ALLOW_STUB_OAUTH === "1"
        ? new StubOAuthVerifier({ MANTLE_ALLOW_STUB_OAUTH: "1" })
        : (() => {
            if (!env.OAUTH_KV) throw new Error(
              "OAUTH_KV binding is required when MANTLE_ALLOW_STUB_OAUTH is not set. " +
              "Add [[kv_namespaces]] binding = \"OAUTH_KV\" to wrangler.toml."
            );
            return new WorkersOAuthVerifier(env.OAUTH_KV);
          })(),
    },
    adminAuth,
  };
}

function buildAdminAuth(env: Env): AdminAuthConfig | undefined {
  const { OAUTH_KV, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ADMIN_GITHUB_LOGIN } = env;
  if (!OAUTH_KV || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !ADMIN_GITHUB_LOGIN) return undefined;
  return {
    oauthProvider: createOAuthProvider(),
    oauthKv: OAUTH_KV,
    githubClientId: GITHUB_CLIENT_ID,
    githubClientSecret: GITHUB_CLIENT_SECRET,
    adminGithubLogin: ADMIN_GITHUB_LOGIN,
  };
}
