import type {
  AnyHandler,
  CreateCmsRuntimeArgs,
  PublicPathResolver,
  TemplateRegistry,
} from "@aotterclam/clam-cms-runtime";
import type { Manifest, SiteDefaults } from "@aotterclam/clam-cms-spec";

/**
 * Consumer-supplied config for the Cloudflare adapter mounts.
 *
 * `manifests` + `handlers` + `templates` + `siteDefaults` +
 * `publicPathResolver` are the runtime inputs (same shape as
 * `createCmsRuntime`); `bindings` is the `{ db, kv, sessions,
 * assets, oauth }` quintuple from the worker `env` after wrapping
 * with the binding adapters in `bindings/`.
 *
 * Adapters separate runtime config from CF binding config so the
 * consumer can compose `bindings` from `env` once at the top of their
 * worker and pass to every mount factory (`mountServerEndpoints`,
 * `mountMcp`, `mountPublicRoutes`).
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
    "db" | "kv" | "sessions" | "assets" | "oauth"
  >;
}
