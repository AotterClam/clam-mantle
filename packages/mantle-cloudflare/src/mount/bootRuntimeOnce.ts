import {
  createCmsRuntime,
  type CmsRuntime,
} from "@aotter/mantle-runtime";
import type { CmsConfig } from "./cmsConfig.js";

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
 *   const runtime = await cmsRef.get(); // throws on first-call boot failure; retries on next call
 *
 * The cache lives at module scope in the consumer's worker, surviving
 * across requests within a single isolate but resetting on cold start
 * (which is fine — boot is idempotent).
 */
export interface CmsRuntimeRef {
  /** Get the booted runtime. First call runs `bootInit`; subsequent
   *  calls return the cached promise. On rejection, the cache resets
   *  so the NEXT call retries — preventing isolate-poisoning. */
  get(): Promise<CmsRuntime>;
}

export function createCmsRef(config: CmsConfig): CmsRuntimeRef {
  const runtime = createCmsRuntime({
    manifests: config.manifests,
    handlers: config.handlers,
    templates: config.templates,
    siteDefaults: config.siteDefaults,
    db: config.bindings.db,
    kv: config.bindings.kv,
    sessions: config.bindings.sessions,
    assets: config.bindings.assets,
    oauth: config.bindings.oauth,
  });

  let booted: Promise<CmsRuntime> | null = null;
  return {
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
