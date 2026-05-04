import type { OAuthIdentity, OAuthVerifier } from "@aotter/mantle-runtime";

/**
 * Stub `OAuthVerifier` for v0.1.0 dev / smoke testing — accepts any
 * bearer token formatted `dev-<userId>` and returns a synthetic
 * identity. Real DCR-compliant verification via
 * `@cloudflare/workers-oauth-provider` lands in a follow-up commit
 * once the OAuth handshake routes are wired (`/oauth/token`,
 * `/oauth/register`, `/.well-known/oauth-*`, consent UI).
 *
 * The stub keeps MCP smoke-testable end-to-end without setting up
 * real OAuth — `Authorization: Bearer dev-u-1` is enough to exercise
 * the verify path. Production wiring replaces this binding entirely.
 */
export class StubOAuthVerifier implements OAuthVerifier {
  async verifyAccessToken(req: Request): Promise<OAuthIdentity | null> {
    const auth = req.headers.get("authorization");
    if (!auth || !auth.startsWith("Bearer ")) return null;
    const token = auth.slice("Bearer ".length).trim();
    if (!token.startsWith("dev-")) return null;
    const userId = token.slice("dev-".length);
    if (!userId) return null;
    return { userId, clientId: "dev", scopes: ["mcp"] };
  }
}
