import { getOAuthApi, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { OAuthIdentity, OAuthVerifier } from "@aotter/mantle-runtime";
import {
  OAUTH_AUTHORIZE_PATH,
  OAUTH_REGISTER_PATH,
  OAUTH_TOKEN_PATH,
} from "../oauth/oauthConstants.js";

/**
 * Production `OAuthVerifier` that verifies bearer tokens issued by the
 * `@cloudflare/workers-oauth-provider` KV store. Uses `getOAuthApi` +
 * `unwrapToken` — no request routing involved, just token lookup.
 *
 * Construct once per isolate with the OAUTH_KV binding and store on the
 * adapter's runtime config alongside the D1 bindings.
 */
export class WorkersOAuthVerifier implements OAuthVerifier {
  private readonly api: OAuthHelpers;

  constructor(kv: KVNamespace) {
    this.api = getOAuthApi(
      {
        defaultHandler: { fetch() { throw new Error("not reached"); } } as never,
        authorizeEndpoint: OAUTH_AUTHORIZE_PATH,
        tokenEndpoint: OAUTH_TOKEN_PATH,
        clientRegistrationEndpoint: OAUTH_REGISTER_PATH,
      },
      { OAUTH_KV: kv },
    );
  }

  async verifyAccessToken(req: Request): Promise<OAuthIdentity | null> {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    const token = auth.slice("Bearer ".length).trim();
    if (!token) return null;

    const summary = await this.api.unwrapToken(token);
    if (!summary) return null;

    return {
      userId: summary.userId,
      clientId: summary.grant.clientId,
      scopes: summary.scope,
    };
  }
}
