/**
 * Path constants shared between `oauthSingleton.ts` (which constructs
 * `OAuthProvider`) and `mountOAuth.ts` (which mounts the `/authorize`
 * consent handler against the consumer's Hono app).
 *
 * Namespaced under `/oauth/*` to avoid squatting on generic root
 * paths (consumers might want `/register`, `/token`, `/authorize` for
 * their own routes). claude.ai's MCP OAuth client reads AS metadata
 * (RFC 8414) and follows whatever endpoints we advertise — verified
 * 2026-05-15 against `cms.aotterclam.ai` with the namespaced paths.
 */

export const OAUTH_AUTHORIZE_PATH = "/oauth/authorize";
export const OAUTH_TOKEN_PATH = "/oauth/token";
export const OAUTH_REGISTER_PATH = "/oauth/register";
