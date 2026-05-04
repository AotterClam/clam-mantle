import type {
  AnyHandler,
  CreateCmsRuntimeArgs,
  TemplateRegistry,
} from "@aotter/mantle-runtime";
import type { Manifest, SiteDefaults } from "@aotter/mantle-spec";

/**
 * Consumer-supplied config for the Cloudflare adapter mounts.
 *
 * `manifests` + `handlers` + `templates` + `siteDefaults` are the
 * runtime inputs (same shape as `createCmsRuntime`); `bindings` is
 * the `{ db, kv, sessions, assets, oauth }` quintuple from the
 * worker `env` after wrapping with the binding adapters in
 * `bindings/`.
 *
 * Adapters separate runtime config from CF binding config so the
 * consumer can compose `bindings` from `env` once at the top of their
 * worker and pass to both `mountServerEndpoints` and `mountAdmin`.
 */
export interface CmsConfig {
  readonly manifests: readonly Manifest[];
  readonly handlers?: Readonly<Record<string, AnyHandler>>;
  readonly templates?: TemplateRegistry;
  readonly siteDefaults?: SiteDefaults;
  readonly bindings: Pick<
    CreateCmsRuntimeArgs,
    "db" | "kv" | "sessions" | "assets" | "oauth"
  >;
}
