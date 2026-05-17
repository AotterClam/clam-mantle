import type { Manifest } from "../../domain/model/ManifestGrammar.js";

export interface EmitOpenapiRequest {
  readonly manifests: ReadonlyArray<Manifest>;
  readonly title: string;
  readonly version: string;
  /**
   * Better Auth session cookie name surfaced in the OpenAPI
   * `cookieAuth` security scheme for auth-gated Views. Defaults to
   * `__Secure-better-auth.session_token` (production default — Better
   * Auth adds `__Secure-` when baseURL is HTTPS). Override to
   * `better-auth.session_token` for local/non-secure deployments.
   */
  readonly sessionCookieName?: string;
}
