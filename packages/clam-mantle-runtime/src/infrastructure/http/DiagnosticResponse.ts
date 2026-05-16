import {
  httpStatusFor,
  redactForWire,
  type Diagnostic,
} from "@aotterclam/clam-mantle-spec";

/**
 * Build the HTTP response for a Diagnostic. Strips `candidates` per
 * ADR-0008 (security: don't leak schema info to untrusted callers)
 * and looks up the HTTP status from the spec's central mapping so
 * every adapter agrees on one wire shape.
 *
 * Framework-agnostic — returns a plain `Response` so the cms-cloudflare
 * Hono mounts (and any future adapter) can hand it back unchanged.
 */
export function diagnosticResponse(d: Diagnostic): Response {
  return Response.json(redactForWire(d), { status: httpStatusFor(d) });
}
