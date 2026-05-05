/**
 * `@aotter/mantle-cloudflare` — Cloudflare Workers adapter for
 * mantle. Exports:
 *
 *   - 5 binding adapters that bind ADR-0011 ports against the runtime
 *     CF bindings (D1Database / KVNamespace / Fetcher).
 *   - `mountServerEndpoints` — Hono factory mounting `/api/views/*`
 *     + HTTP Triggers from Procedure manifests.
 *   - `mountMcp` — Hono factory mounting the MCP JSON-RPC dispatcher
 *     at `/mcp`. Bearer-token gated via the runtime `OAuthVerifier`
 *     port; no `/oauth/{authorize,token,register}` route mount in
 *     v0.1.0 (deferred to a `@cloudflare/workers-oauth-provider`
 *     integration in v0.1.x).
 *   - `mountPublicRoutes` — Hono factory mounting the rendered-blog
 *     surface (`/{locale}/{collection}/{slug}`, `/sitemap.xml`,
 *     `.md` mirror, `llms.txt`). Opt-in; `starters/blank` skips it.
 *
 * MUST be the only place in the codebase importing `D1Database`,
 * `KVNamespace`, etc. The runtime layer (`@aotter/mantle-runtime`)
 * stays portable; the Netlify stub package exists as the public
 * reminder.
 */
export * from "./bindings/index.js";
export * from "./mount/index.js";
export * from "./handlers/index.js";
// WorkersOAuthVerifier and createOAuthProvider are in the "/cf" subpath only —
// they import cloudflare:workers which is not resolvable in Node/Vitest.
