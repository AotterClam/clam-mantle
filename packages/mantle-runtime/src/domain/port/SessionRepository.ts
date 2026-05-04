/**
 * `SessionRepository` — cookie-session state. Used for staff sessions,
 * OAuth state during sign-in, and MCP transport sessions. The CF
 * adapter happens to back this with the same database the
 * `DatabaseDriver` uses, but the typed surface keeps callers off raw
 * SQL and lets future adapters swap in Redis, signed JWTs (no
 * read-back), or cookie-only stateless sessions without touching the
 * runtime.
 *
 * Tokens are opaque strings — adapters generate them; the runtime
 * never inspects format.
 *
 * Renamed from `SessionPort` per the clean-architecture naming
 * convention.
 */
export interface SessionRepository {
  /** Read a session by its opaque token. Returns `null` when the
   *  token is unknown OR the session has expired (adapters MAY treat
   *  expiration as "not found" and avoid surfacing the difference). */
  read(token: string): Promise<Session | null>;
  /** Persist a new session. Adapters honour `session.expiresAt`. */
  write(session: Session): Promise<void>;
  /** Invalidate a session by token. Idempotent — invalidating an
   *  unknown token is a no-op. */
  invalidate(token: string): Promise<void>;
}

export interface Session {
  /** Opaque token — value the cookie carries. Adapters generate. */
  readonly token: string;
  /** ID of the authenticated user (`users.id` row). */
  readonly userId: string;
  /** Unix epoch ms. */
  readonly createdAt: number;
  /** Unix epoch ms. Sessions past this are treated as not-found. */
  readonly expiresAt: number;
}
