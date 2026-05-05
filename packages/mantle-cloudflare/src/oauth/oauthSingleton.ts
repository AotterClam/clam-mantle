import {
  OAuthProvider,
  type TokenExchangeCallbackOptions,
  type TokenExchangeCallbackResult,
} from "@cloudflare/workers-oauth-provider";
import {
  BypassToConsent,
  OAUTH_AUTHORIZE_PATH,
  OAUTH_REGISTER_PATH,
  OAUTH_TOKEN_PATH,
} from "./oauthConstants.js";


/**
 * Construct a new `OAuthProvider` without an MCP API route (wired in #20).
 * The `defaultHandler` throws `BypassToConsent` so `/oauth/authorize`
 * falls through to the Hono consent handler while still receiving the
 * per-request `OAUTH_PROVIDER` helpers injected by the library.
 *
 * Requires `env.OAUTH_KV: KVNamespace` at request time (bind in
 * wrangler.toml). Call once per isolate and store in `AdminAuthConfig`.
 */
export function createOAuthProvider(): OAuthProvider {
  return new OAuthProvider({
    defaultHandler: {
      fetch() {
        throw new BypassToConsent();
      },
    } as never,
    authorizeEndpoint: OAUTH_AUTHORIZE_PATH,
    tokenEndpoint: OAUTH_TOKEN_PATH,
    clientRegistrationEndpoint: OAUTH_REGISTER_PATH,
    tokenExchangeCallback: githubRevocationProbe,
  });
}

/**
 * Refresh-token hook: verifies the snapshotted GitHub access token is
 * still valid. Refuses the refresh if GitHub returns 401 (user revoked
 * access). Network/timeout failures are treated as soft — a transient
 * GitHub hiccup should not lock the operator out.
 */
async function githubRevocationProbe(
  options: TokenExchangeCallbackOptions,
): Promise<TokenExchangeCallbackResult | void> {
  if (options.grantType !== "refresh_token") return;
  const token = (options.props as { githubAccessToken?: string } | null)?.githubAccessToken;
  if (!token) return;

  let probe: Response;
  try {
    probe = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": "aotter-cms",
        accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    return;
  }

  if (probe.status === 401) {
    throw new Error("GitHub authorization revoked; please sign in again at /admin.");
  }
}
