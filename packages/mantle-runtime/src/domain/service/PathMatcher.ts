/**
 * Match a request path against a Trigger path with OpenAPI-style
 * `{param}` segments. Returns the extracted params on a match, or
 * `null` if the segments don't line up.
 *
 *   matchPath("/api/contact", "/api/contact")       → {}
 *   matchPath("/api/posts/{id}", "/api/posts/abc")  → { id: "abc" }
 *   matchPath("/api/posts/{id}", "/api/posts")      → null
 *   matchPath("/api/posts", "/api/posts/abc")       → null
 *
 * Pure path math — no I/O. Lives in `domain/service/` so adapters
 * (HTTP layer) can call it without dragging an HTTP framework dep.
 */
export function matchPath(
  triggerPath: string,
  requestPath: string,
): Record<string, string> | null {
  const tParts = triggerPath.split("/");
  const rParts = requestPath.split("/");
  if (tParts.length !== rParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < tParts.length; i++) {
    const t = tParts[i]!;
    const r = rParts[i]!;
    if (t.startsWith("{") && t.endsWith("}")) {
      params[t.slice(1, -1)] = decodeURIComponent(r);
    } else if (t !== r) {
      return null;
    }
  }
  return params;
}
