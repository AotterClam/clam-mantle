import type { Session, SessionRepository } from "../../domain/port/SessionRepository.js";
import { DEFAULT_SESSION_COOKIE, readCookie } from "./CookieReader.js";

/**
 * Resolve the active session (if any) for an incoming request.
 * Returns `null` when no cookie is present, the session is unknown,
 * or it has expired (the `SessionRepository` impl decides whether to
 * surface expiration as `null` directly or check `expiresAt` here).
 */
export interface SessionResolverArgs {
  readonly req: Request;
  readonly sessions: SessionRepository;
  readonly cookieName?: string;
  readonly now?: () => number;
}

export async function readActiveSession(args: SessionResolverArgs): Promise<Session | null> {
  const cookieName = args.cookieName ?? DEFAULT_SESSION_COOKIE;
  const token = readCookie(args.req, cookieName);
  if (!token) return null;
  const session = await args.sessions.read(token);
  if (!session) return null;
  const now = args.now ? args.now() : Date.now();
  if (session.expiresAt <= now) return null;
  return session;
}
