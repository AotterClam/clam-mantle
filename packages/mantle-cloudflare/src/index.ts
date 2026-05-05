/**
 * `@aotter/mantle-cloudflare` — Cloudflare Workers adapter for
 * mantle. Exports:
 *
 *   - 5 binding adapters that bind ADR-0011 ports against the runtime
 *     CF bindings (D1Database / KVNamespace / Fetcher).
 *   - `mountServerEndpoints` — Hono factory that mounts public-facing
 *     http Triggers + MCP endpoint on the consumer's worker (commit
 *     6b/6c).
 *   - `mountAdmin` — Hono factory mounting the admin SPA (commit 5).
 *
 * MUST be the only place in the codebase importing `D1Database`,
 * `KVNamespace`, etc. The runtime layer (`@aotter/mantle-runtime`)
 * stays portable; the Netlify stub package exists as the public
 * reminder.
 */
export * from "./bindings/index.js";
export * from "./mount/index.js";
export * from "./handlers/index.js";
