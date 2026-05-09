import {
  createCmsRuntime,
  type CmsRuntime,
} from "@aotterclam/clam-cms-runtime";
import type { Manifest } from "@aotterclam/clam-cms-spec";
import type { Auth } from "../auth/createAuth.js";
import type { CmsConfig } from "./cmsConfig.js";

/**
 * Per-isolate runtime singleton. The cached promise MUST reset on
 * rejection (PR #29 carry-forward) — otherwise a transient D1 error
 * during boot poisons the isolate permanently and every subsequent
 * request re-throws the same rejected promise.
 */
export interface CmsRuntimeRef {
  get(): Promise<CmsRuntime>;
  readonly manifests: readonly Manifest[];
  readonly auth: Auth;
}

export function createCmsRef(config: CmsConfig): CmsRuntimeRef {
  const runtime = createCmsRuntime({
    manifests: config.manifests,
    handlers: config.handlers,
    templates: config.templates,
    siteDefaults: config.siteDefaults,
    publicPathResolver: config.publicPathResolver,
    mediaAllowSvg: config.mediaAllowSvg,
    mediaMaxBytes: config.mediaMaxBytes,
    ...config.bindings,
  });

  let booted: Promise<CmsRuntime> | null = null;
  return {
    manifests: config.manifests,
    auth: config.auth,
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
