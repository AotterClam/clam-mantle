import type {
  AnyHandler,
  CreateCmsRuntimeArgs,
  PublicPathResolver,
  TemplateRegistry,
} from "@aotter/mantle-runtime";
import type { Manifest, SiteDefaults } from "@aotter/mantle-spec";
import type { Auth } from "../auth/createAuth.js";

/**
 * Consumer-supplied config for the Cloudflare adapter mounts. `auth`
 * (Better Auth) gates `/admin/api/*` + MCP bearers. `bindings` carries
 * the three runtime-port adapters (db / kv / assets).
 */
export interface CmsConfig {
  readonly manifests: readonly Manifest[];
  readonly handlers?: Readonly<Record<string, AnyHandler>>;
  readonly templates?: TemplateRegistry;
  readonly siteDefaults?: SiteDefaults;
  readonly publicPathResolver?: PublicPathResolver;
  readonly bindings: Pick<CreateCmsRuntimeArgs, "db" | "kv" | "assets"> & {
    /** Optional media storage adapter. When set, media MCP tools and
     *  `/admin/api/media/*` endpoints are registered. Forwarded to the
     *  runtime as `mediaStorage`. */
    readonly mediaStorage?: CreateCmsRuntimeArgs["mediaStorage"];
    /** Optional durable hook dispatcher. When set, `after_*` lifecycle
     *  hooks fire through this instead of riding `ctx.waitUntil`. The
     *  Cloudflare adapter expects a `WorkersQueueDurableHookDispatcher`
     *  bound to the `mantle_internal` queue here. */
    readonly durableHookDispatcher?: CreateCmsRuntimeArgs["durableHookDispatcher"];
  };
  /** Pass-through to runtime: SVG opt-in flag (default false). */
  readonly mediaAllowSvg?: boolean;
  /** Pass-through to runtime: byte ceiling for uploads (default 25MB). */
  readonly mediaMaxBytes?: number;
  readonly auth: Auth;
}
