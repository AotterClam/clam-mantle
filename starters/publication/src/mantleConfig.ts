import {
  AssetsAssetServer,
  D1DatabaseDriver,
  KvCacheBinding,
  R2MediaStorage,
  type Auth,
  type CmsConfig,
} from "@aotter/mantle-cloudflare";
import { AwsClient } from "aws4fetch";
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
  /** Optional **public** R2 media bucket. When bound (in `wrangler.toml`'s
   *  `[[r2_buckets]] binding = "MEDIA"`), the runtime registers
   *  `create_media_upload` / `commit_media_upload` MCP tools and the
   *  `/admin/api/media/uploads` admin lifecycle. Reads bypass the
   *  Worker (`MEDIA_PUBLIC_URL_BASE` → CDN → R2). Leave unbound to
   *  keep first-run provisioning R2-free.
   *
   *  Private content (subscription-gated, fan-club, signed-GET) lands
   *  in v0.2 as a SEPARATE binding (`MEDIA_PRIVATE` or similar) wired
   *  to a separate `PrivateMediaStorage` port. Two buckets, two ports.
   *  See ADR-0011 § "Public vs private media — two buckets, two ports". */
  readonly MEDIA?: R2Bucket;
  /** Public read-base URL for media. `https://media.<domain>` for
   *  custom domain, or `https://pub-<hash>.r2.dev` for the dev-only
   *  fallback. Required when `MEDIA` is bound. */
  readonly MEDIA_PUBLIC_URL_BASE?: string;
  /** R2 S3 endpoint for THIS bucket. Format:
   *  `https://<bucket>.<account>.r2.cloudflarestorage.com`. Used as
   *  the host of presigned PUT URLs. Required when `MEDIA` is bound. */
  readonly MEDIA_S3_ENDPOINT?: string;
  /** R2 S3 access key id. Generate via R2 dashboard → Manage R2 API
   *  Tokens. `wrangler secret put MEDIA_S3_ACCESS_KEY_ID`. */
  readonly MEDIA_S3_ACCESS_KEY_ID?: string;
  /** R2 S3 secret access key. `wrangler secret put MEDIA_S3_SECRET_ACCESS_KEY`. */
  readonly MEDIA_S3_SECRET_ACCESS_KEY?: string;
  /** Opt-in flag for SVG uploads. Defaults off — object stores don't
   *  sanitize SVG payloads. */
  readonly MEDIA_ALLOW_SVG?: string;
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
      ...buildMediaStorage(env),
    },
    mediaAllowSvg: env.MEDIA_ALLOW_SVG === "1",
    auth,
  };
}

/** Wire `R2MediaStorage` only when ALL the env requires are present.
 *  Partial config is a deployment error — fail loudly so the operator
 *  notices, rather than silently dropping the feature. */
function buildMediaStorage(env: Env): { mediaStorage?: R2MediaStorage } {
  if (!env.MEDIA) return {};
  const required = {
    MEDIA_PUBLIC_URL_BASE: env.MEDIA_PUBLIC_URL_BASE,
    MEDIA_S3_ENDPOINT: env.MEDIA_S3_ENDPOINT,
    MEDIA_S3_ACCESS_KEY_ID: env.MEDIA_S3_ACCESS_KEY_ID,
    MEDIA_S3_SECRET_ACCESS_KEY: env.MEDIA_S3_SECRET_ACCESS_KEY,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `MEDIA bucket is bound but the following env vars are missing: ${missing.join(", ")}.`,
    );
  }
  const s3 = new AwsClient({
    accessKeyId: required.MEDIA_S3_ACCESS_KEY_ID!,
    secretAccessKey: required.MEDIA_S3_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  return {
    mediaStorage: new R2MediaStorage(
      env.MEDIA,
      s3,
      required.MEDIA_S3_ENDPOINT!,
      required.MEDIA_PUBLIC_URL_BASE!,
    ),
  };
}
