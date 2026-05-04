/**
 * `@aotter/mantle-runtime` — public surface.
 *
 * Adapter-agnostic runtime engine for mantle. Layered per the
 * Aotter clean-architecture convention (mirrors `aotter-mantle/mantle/core`):
 *
 *   domain ← usecase ← infrastructure ← runtime.ts (assembly root)
 *
 * Adapters (e.g. `@aotter/mantle-cloudflare`) implement the 5
 * port interfaces in `domain/port/` (DatabaseDriver / KvCache /
 * SessionRepository / AssetServer / OAuthVerifier) and call
 * `createCmsRuntime` to compose everything.
 *
 * MUST NOT import `D1Database` / `KVNamespace` / any Cloudflare-
 * specific type. The Netlify stub package exists as a public reminder.
 */

// Domain — model + ports + services.
export * from "./domain/index.js";

// Use cases.
export * from "./usecase/index.js";

// Infrastructure — adapters bound to ports.
export * from "./infrastructure/index.js";

// Assembly root.
export {
  createCmsRuntime,
  type CreateCmsRuntimeArgs,
  type CmsRuntime,
} from "./runtime.js";
