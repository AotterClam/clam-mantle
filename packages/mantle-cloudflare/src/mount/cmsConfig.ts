import type {
  AnyHandler,
  CreateCmsRuntimeArgs,
  PublicPathResolver,
  TemplateRegistry,
} from "@aotter/mantle-runtime";
import type { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import type { Manifest, SiteDefaults } from "@aotter/mantle-spec";

/**
 * GitHub OAuth config for the admin sign-in flow and OAuth consent UI.
 * Required to mount `/admin/auth/github`, `/admin/auth/github/callback`,
 * and `/oauth/authorize`. If omitted the admin auth routes are not mounted
 * and the OAuthProvider passthrough (token / register) is skipped.
 *
 * The `oauthProvider` must be created by the consumer using
 * `createOAuthProvider()` from this package. Accepting it here (rather than
 * constructing it internally in `createCmsRef`) keeps `bootRuntimeOnce.ts`
 * free of `@cloudflare/workers-oauth-provider` imports so the smoke tests
 * can exercise `createCmsRef` without triggering CF-only `cloudflare:`
 * protocol imports.
 */
export interface AdminAuthConfig {
  /** Pre-constructed OAuthProvider instance. Create with `createOAuthProvider()`. */
  readonly oauthProvider: OAuthProvider;
  /** CF KVNamespace used by @cloudflare/workers-oauth-provider for token,
   *  grant, and client registration storage. Bind as `OAUTH_KV` in
   *  wrangler.toml. */
  readonly oauthKv: KVNamespace;
  /** GitHub OAuth App client_id. */
  readonly githubClientId: string;
  /** GitHub OAuth App client_secret. */
  readonly githubClientSecret: string;
  /** GitHub login that receives `owner` staff role on first sign-in
   *  (mirrors the `ADMIN_GITHUB_LOGIN` env var pattern). */
  readonly adminGithubLogin: string;
}

/**
 * Consumer-supplied config for the Cloudflare adapter mounts.
 *
 * `manifests` + `handlers` + `templates` + `siteDefaults` +
 * `publicPathResolver` are the runtime inputs (same shape as
 * `createCmsRuntime`); `bindings` is the `{ db, kv, sessions,
 * assets, oauth, users, staff }` set from the worker `env` after
 * wrapping with the binding adapters in `bindings/`.
 *
 * Supply `adminAuth` to enable the GitHub sign-in flow, the OAuth
 * consent UI, and the DCR / token endpoints required for MCP.
 */
export interface CmsConfig {
  readonly manifests: readonly Manifest[];
  readonly handlers?: Readonly<Record<string, AnyHandler>>;
  readonly templates?: TemplateRegistry;
  readonly siteDefaults?: SiteDefaults;
  /** Optional public-path resolver. Required for the SEO/sitemap path
   *  to emit correct URLs. `mountPublicRoutes` reads this off the ref
   *  via `ref.get()` rather than asking the consumer to thread it
   *  twice. */
  readonly publicPathResolver?: PublicPathResolver;
  readonly bindings: Pick<
    CreateCmsRuntimeArgs,
    "db" | "kv" | "sessions" | "assets" | "oauth" | "users" | "staff"
  >;
  /** Optional. Supply to enable GitHub admin auth + OAuth consent UI +
   *  DCR endpoints. Without this, the `/admin/auth/*` and `/oauth/*`
   *  routes are not registered and the MCP endpoint requires a
   *  `StubOAuthVerifier`-compatible bearer token. */
  readonly adminAuth?: AdminAuthConfig;
}
