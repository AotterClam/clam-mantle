/**
 * `@aotterclam/clam-cms-cloudflare` — Cloudflare Workers adapter for
 * clam-cms. Exports:
 *
 *   - 5 binding adapters that bind ADR-0011 ports against the runtime
 *     CF bindings (D1Database / KVNamespace / Fetcher).
 *   - `mountServerEndpoints` — Hono factory mounting `/api/views/*`
 *     + HTTP Triggers from Procedure manifests.
 *   - `mountMcp` — Hono factory mounting the MCP JSON-RPC dispatcher
 *     at `/mcp`. Bearer-token gated via the runtime `OAuthVerifier`
 *     port. When `adminAuth` is supplied, `mountServerEndpoints`
 *     also mounts GitHub sign-in plus OAuth discovery, DCR, token, and
 *     consent routes backed by `@cloudflare/workers-oauth-provider`.
 *   - `mountPublicRoutes` — Hono factory mounting the rendered-blog
 *     surface (`/{locale}/{collection}/{slug}`, `/sitemap.xml`,
 *     `.md` mirror, `llms.txt`). Opt-in; `starters/blank` skips it.
 *
 * MUST be the only place in the codebase importing `D1Database`,
 * `KVNamespace`, etc. The runtime layer (`@aotterclam/clam-cms-runtime`)
 * stays portable; the Netlify stub package exists as the public
 * reminder.
 */
export * from "./bindings/index.js";
export * from "./mount/index.js";
export * from "./handlers/index.js";
// WorkersOAuthVerifier and createOAuthProvider are in the "/cf" subpath only —
// they import cloudflare:workers which is not resolvable in Node/Vitest.
