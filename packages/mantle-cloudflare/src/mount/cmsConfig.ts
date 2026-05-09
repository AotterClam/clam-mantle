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
  readonly bindings: Pick<CreateCmsRuntimeArgs, "db" | "kv" | "assets">;
  readonly auth: Auth;
}
