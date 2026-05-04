import type { OAuthIdentity, OAuthVerifier } from "@aotter/mantle-runtime";

/**
 * Stub `OAuthVerifier` for dev / smoke testing — accepts any bearer
 * token formatted `dev-<userId>` and returns a synthetic identity.
 * Real DCR-compliant verification via
 * `@cloudflare/workers-oauth-provider` lands in a follow-up commit.
 *
 * The constructor REQUIRES `env.MANTLE_ALLOW_STUB_OAUTH === "1"` so a
 * production deploy can't accidentally wire it. Local dev sets the
 * flag in `.dev.vars`; smoke tests pass it explicitly.
 */
export class StubOAuthVerifier implements OAuthVerifier {
  constructor(env: { readonly MANTLE_ALLOW_STUB_OAUTH?: string }) {
    if (env.MANTLE_ALLOW_STUB_OAUTH !== "1") {
      throw new Error(
        "StubOAuthVerifier refuses to run without env.MANTLE_ALLOW_STUB_OAUTH='1'. " +
          "This binding accepts any `Bearer dev-<userId>` token and is for local dev / tests only. " +
          "In production, wire the real @cloudflare/workers-oauth-provider verifier instead.",
      );
    }
  }

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
