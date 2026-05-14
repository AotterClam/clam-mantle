import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import {
  OAUTH_AUTHORIZE_PATH,
  OAUTH_REGISTER_PATH,
  OAUTH_TOKEN_PATH,
} from "./oauthConstants.js";

export interface CreateOAuthProviderArgs {
  /** Worker module shape for non-OAuth requests. Typically the
   *  consumer's Hono app: `{ fetch: app.fetch }`. The lib injects
   *  `OAUTH_PROVIDER` onto env BEFORE calling this, so the consumer's
   *  `/authorize` route can pull helpers via `c.env.OAUTH_PROVIDER`. */
  readonly defaultHandler: ExportedHandler<Record<string, unknown>>;
  /** Map of MCP resource path → worker handler. Lib verifies the
   *  bearer token, then dispatches to the matching handler with
   *  `ctx.props` set to whatever was passed to
   *  `completeAuthorization({ props })`. Use `createMcpApiHandler`
   *  to build the handler value for each entry. */
  readonly apiHandlers: Record<string, ExportedHandler<Record<string, unknown>>>;
  /** Scopes advertised in `scopes_supported` for both AS metadata
   *  (RFC 8414) and PRM (RFC 9728). Defaults to `["mcp"]` — a single
   *  non-colon-namespaced scope, which is what claude.ai's MCP OAuth
   *  client actually understands. Verified 2026-05-15: colon-shaped
   *  scopes (e.g. `mcp:read`, `mcp:staff`) cause claude.ai to omit
   *  `scope=` from /authorize, ending the flow with `ofid_*` post-token.
   *  Staff vs public differentiation should be enforced server-side
   *  in the apiHandler (D1 role lookup), not through OAuth scope. */
  readonly scopesSupported?: readonly string[];
}

/**
 * Build the top-level OAuthProvider. **Export the result as the
 * worker's `default`** so the lib gets every request first and can
 * route OAuth endpoints internally, fan MCP requests to apiHandlers,
 * and inject helpers onto env before forwarding to defaultHandler.
 *
 * Endpoint paths default to `/oauth/{authorize,token,register}` —
 * see `oauthConstants.ts`.
 */
export function createOAuthProvider(args: CreateOAuthProviderArgs): OAuthProvider {
  return new OAuthProvider({
    apiHandlers: args.apiHandlers as never,
    defaultHandler: args.defaultHandler as never,
    authorizeEndpoint: OAUTH_AUTHORIZE_PATH,
    tokenEndpoint: OAUTH_TOKEN_PATH,
    clientRegistrationEndpoint: OAUTH_REGISTER_PATH,
    scopesSupported: [...(args.scopesSupported ?? ["mcp"])],
  });
}
