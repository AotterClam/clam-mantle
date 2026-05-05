/**
 * Constants and helpers shared between `oauthSingleton.ts`
 * (which imports @cloudflare/workers-oauth-provider) and
 * `mountServerEndpoints.ts` (which must not, so the smoke tests
 * can run under Node.js without hitting `cloudflare:workers`).
 */

export const OAUTH_AUTHORIZE_PATH = "/oauth/authorize";
export const OAUTH_TOKEN_PATH = "/oauth/token";
export const OAUTH_REGISTER_PATH = "/oauth/register";

const OAUTH_PROVIDER_PATHS = new Set<string>([
  OAUTH_AUTHORIZE_PATH,
  OAUTH_TOKEN_PATH,
  OAUTH_REGISTER_PATH,
]);

/** True when the request path should be handed to `oauthProvider.fetch(...)`. */
export function isOauthProviderPath(pathname: string): boolean {
  return OAUTH_PROVIDER_PATHS.has(pathname);
}

export class BypassToConsent extends Error {
  constructor() {
    super("OAuthProvider defaultHandler hit — caller will render the consent UI.");
    this.name = "BypassToConsent";
  }
}
