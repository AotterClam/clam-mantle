import {
  createCmsRuntime,
  type CmsRuntime,
} from "@aotterclam/clam-cms-runtime";
import type { Manifest } from "@aotterclam/clam-cms-spec";
import type { Auth } from "../auth/createAuth.js";
import type { AdminAuthConfig, CmsConfig } from "./cmsConfig.js";

/**
 * Per-isolate runtime singleton with poison-isolate-resistant boot
 * caching. POC PR #29 carry-forward: the cached promise MUST be reset
 * to `null` on rejection, otherwise a transient D1 error during
 * migrations or `siteConfig.seed` poisons the isolate permanently —
 * every subsequent request re-throws the same rejected promise without
 * ever retrying.
 *
 * Usage at the worker entrypoint:
 *
 *   const cmsRef = createCmsRef(config);
 *   mountServerEndpoints(app, cmsRef);
 *   mountMcp(app, cmsRef);
 *
 * The ref carries the manifest set so callers don't have to thread it
 * separately to every mount. The cache lives at module scope in the
 * consumer's worker, surviving across requests within a single isolate
 * but resetting on cold start (which is fine — boot is idempotent).
 */
export interface CmsRuntimeRef {
  /** Get the booted runtime. First call runs `bootInit`; subsequent
   *  calls return the cached promise. On rejection, the cache resets
   *  so the NEXT call retries — preventing isolate-poisoning. */
  get(): Promise<CmsRuntime>;
  /** The manifest set this ref's runtime was built from. Mounts use
   *  this to materialize routes statically without awaiting boot. */
  readonly manifests: readonly Manifest[];
  /** @deprecated Superseded by `auth` (ADR-0014). Removed once the
   *  legacy /admin/auth/* + /oauth/* block goes. */
  readonly adminAuth: AdminAuthConfig | null;
  readonly auth: Auth | null;
}

export function createCmsRef(config: CmsConfig): CmsRuntimeRef {
  const runtime = createCmsRuntime({
    manifests: config.manifests,
    handlers: config.handlers,
    templates: config.templates,
    siteDefaults: config.siteDefaults,
    publicPathResolver: config.publicPathResolver,
    ...config.bindings,
  });

  let booted: Promise<CmsRuntime> | null = null;
  return {
    manifests: config.manifests,
    adminAuth: config.adminAuth ?? null,
    auth: config.auth ?? null,
    get(): Promise<CmsRuntime> {
      if (booted) return booted;
      booted = runtime
        .bootInit()
        .then(() => runtime)
        .catch((err) => {
          booted = null;
          throw err;
        });
      return booted;
    },
  };
}
