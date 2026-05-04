/**
 * `OAuthVerifier` — MCP OAuth provider verifier. The runtime uses
 * this to extract a typed `OAuthIdentity` from a bearer token on
 * incoming MCP requests; from the runtime's perspective, that's the
 * entire surface.
 *
 * Mounting `/oauth/token`, `/oauth/register`, `/.well-known/oauth-*`,
 * and the consent UI is the adapter's responsibility — the CF
 * adapter binds `@cloudflare/workers-oauth-provider` (DCR-compliant,
 * KV-backed) to its Hono app directly. Different adapters have
 * different OAuth conventions, and the spec deliberately doesn't try
 * to unify the wire-level semantics; future adapters need only be
 * compatible at the verify-bearer-token boundary expressed below.
 *
 * See ADR-0011 § OAuthPort for the boundary rationale (and the
 * "Refinement (commit 4)" note that drops `mount()`).
 *
 * Renamed from `OAuthPort` per the clean-architecture naming
 * convention.
 */
export interface OAuthVerifier {
  /** Verify the bearer token on an MCP request. Returns the resolved
   *  identity (typically the granting `userId` plus DCR client info)
   *  or `null` for missing / invalid / expired tokens. */
  verifyAccessToken(req: Request): Promise<OAuthIdentity | null>;
}

export interface OAuthIdentity {
  /** ID of the user who granted this token (`users.id` row). */
  readonly userId: string;
  /** DCR client ID — the MCP client that holds this token. */
  readonly clientId: string;
  /** Granted scopes. Empty array means "no scopes granted"; the
   *  runtime treats that as no MCP access. */
  readonly scopes: readonly string[];
}
