/**
 * `@aotterclam/clam-cms-cloudflare/cf` — Cloudflare-runtime-only surface.
 *
 * These exports import `@cloudflare/workers-oauth-provider` which pulls
 * `cloudflare:workers` — only resolvable inside a CF Workers isolate.
 * They MUST NOT be re-exported from the package root (`./index.ts`) so
 * that Node/Vitest consumers of the root can import without a protocol error.
 *
 * Starters import from this subpath; smoke tests never touch it.
 */
export { WorkersOAuthVerifier } from "./bindings/WorkersOAuthVerifier.js";
export { createOAuthProvider } from "./oauth/oauthSingleton.js";
