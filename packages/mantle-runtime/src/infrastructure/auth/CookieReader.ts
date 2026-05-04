/**
 * Cookie session helpers — read/parse a single named cookie out of a
 * `Request`. The runtime stays HTTP-framework-agnostic; adapters that
 * already parse cookies (Hono's c.req.cookies, etc.) may bypass these
 * helpers and call `SessionRepository.read(token)` directly.
 *
 * Cookie name is configurable so adapters can namespace it
 * (e.g. `__Host-mantle_session`).
 */
export const DEFAULT_SESSION_COOKIE = "mantle_session";

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    if (part.slice(0, eq) === name) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}
