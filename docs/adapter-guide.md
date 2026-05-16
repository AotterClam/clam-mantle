# Adapter implementation guide

This guide is the fresh-developer entry point for implementing a new mantle platform adapter.

Read this with [ADR-0011](adr/0011-adapter-port-spec.md). The source of truth for TypeScript shapes is `packages/mantle-runtime/src/domain/port/`.

Adapter packages live under `packages/adapters/<platform>/` using a plural `adapters` bucket. The npm package names stay unchanged, for example `@aotterclam/mantle-cloudflare`. Keep adapters in this monorepo until the runtime/spec API is stable enough that coordinated releases across separate repositories would not create version skew for starters.

## Required runtime ports

A first-run adapter must implement exactly these three runtime ports:

| Contract | Source | Cloudflare example |
|---|---|---|
| `DatabaseDriver` plus `PreparedStatement` and `MigrationRunner` | `packages/mantle-runtime/src/domain/port/DatabaseDriver.ts` | `packages/adapters/cloudflare/src/bindings/D1DatabaseDriver.ts` |
| `KvCache` | `packages/mantle-runtime/src/domain/port/KvCache.ts` | `packages/adapters/cloudflare/src/bindings/KvCacheBinding.ts` |
| `AssetServer` | `packages/mantle-runtime/src/domain/port/AssetServer.ts` | `packages/adapters/cloudflare/src/bindings/AssetsAssetServer.ts` |

The runtime must not import platform types such as `D1Database`, `KVNamespace`, Cloudflare `Fetcher`, Netlify request objects, Postgres pools, or adapter SDK types. Those live in adapter packages.

## Optional capabilities

Optional ports are enabled only when a feature needs them:

| Contract | Source | Required when |
|---|---|---|
| `MediaStorage` | `packages/mantle-runtime/src/domain/port/MediaStorage.ts` | The adapter exposes admin/MCP media upload flows. |
| `DeferredHookDispatcher` | `packages/mantle-runtime/src/domain/port/DeferredHookDispatcher.ts` | The adapter wants durable queue delivery for `after_*` lifecycle hooks. |

Test seams such as `Clock` and `IdGenerator` are injectable through `createCmsRuntime`, but normal adapters do not need custom implementations.

## Runtime boot

Adapters compose the runtime through `createCmsRuntime`:

```ts
import { createCmsRuntime } from "@aotterclam/mantle-runtime";

const runtime = createCmsRuntime({
  manifests,
  handlers,
  templates,
  siteDefaults,
  db,
  kv,
  assets,
  publicPathResolver,
  mediaStorage,
  deferredHookDispatcher,
});

await runtime.bootInit();
```

`bootInit()` runs canonical migrations, seeds `siteDefaults`, and validates the manifest set. Call it once before serving CMS traffic. The Cloudflare adapter's reference pattern is `packages/adapters/cloudflare/src/mount/bootRuntimeOnce.ts`.

## HTTP and MCP surfaces

The runtime is a library, not an HTTP server. A new adapter must mount equivalent framework routes:

| Surface | Adapter responsibility | Cloudflare reference |
|---|---|---|
| Public/admin HTTP endpoints | Route HTTP Triggers, View REST endpoints, admin SPA assets, and public render routes into runtime use cases. | `packages/adapters/cloudflare/src/mount/mountServerEndpoints.ts`, `mountPublicRoutes.ts` |
| Auth endpoints | Own sign-in/session/OAuth metadata routes through the adapter's Better Auth integration. | `packages/adapters/cloudflare/src/auth/createAuth.ts`, `mountServerEndpoints.ts` |
| MCP endpoints | Mount `/mcp/staff` and `/mcp` via `createOAuthProvider({ apiHandlers })`; the OAuth lib verifies bearer tokens against its KV grant store, then calls the matching apiHandler with `ctx.props` set. The adapter enforces the staff D1 role inside the apiHandler, then dispatches JSON-RPC. | `packages/adapters/cloudflare/src/mount/mountMcp.ts`, `oauth/oauthSingleton.ts`, `oauth/mountOAuth.ts` |

Auth is not a runtime port. Per [ADR-0014](adr/0014-auth-better-auth-and-multi-tenant-mcp.md), the adapter owns Better Auth wiring and passes authenticated user/staff context into runtime dispatchers. Procedure handlers receive that data through `HandlerContext` in `packages/mantle-runtime/src/domain/model/HandlerContext.ts`.

Minimum HTTP behavior for a full adapter:

- Route manifest HTTP Triggers to `runtime.invokeProcedure`.
- Route `GET /api/views/<name>` to `runtime.executeView`.
- Mount admin content APIs with session/role checks before calling runtime content use cases.
- Serve admin SPA assets through `AssetServer`, with an SPA catchall for admin client-side routes.
- Mount public render routes and markdown mirrors when the starter exposes public pages.
- Translate runtime diagnostics and validation failures into stable HTTP JSON responses instead of throwing raw errors.

Minimum auth/MCP behavior:

- Provide Better Auth-compatible sign-in/session routes for the platform.
- Validate `/mcp/staff` requests with the staff D1 admin role (`owner`/`editor`/`contributor`).
- Validate `/mcp` requests with any authenticated session (D1 role check is surface-driven, not OAuth-scope-driven — claude.ai rejects colon-shaped scopes).
- Advertise a single non-colon scope (default `["mcp"]`) in `scopes_supported`. Per-surface enforcement happens server-side in the apiHandler.
- Build `McpAuthContext` from the validated session and pass it to `McpJsonRpcDispatcher`.
- Build procedure `HandlerContext` with `user`, `staff`, adapter `env`, and optional `waitUntil`.

## Static assets

`AssetServer` is required because every adapter must have a strategy for serving the prebuilt admin UI from `@aotterclam/mantle-admin-ui`. The adapter may serve those files from platform assets, a static publish directory, object storage plus CDN, or a filesystem bundle. Return `null` from `AssetServer.fetch()` when a specific asset is not found so the adapter can fall back to the admin SPA catchall.

## Implementation checklist

- [ ] Implement `DatabaseDriver`, including canonical migration tracking.
- [ ] Implement `KvCache`, including prefix listing and opaque cursors.
- [ ] Implement `AssetServer` for the admin UI assets.
- [ ] Compose `createCmsRuntime` with manifests, handlers, templates, site defaults, and required ports.
- [ ] Call `bootInit()` before serving CMS traffic.
- [ ] Mount HTTP Trigger and View REST surfaces.
- [ ] Mount admin/public render routes and admin SPA assets.
- [ ] Provide adapter-owned Better Auth wiring and session helpers.
- [ ] Mount `/mcp/staff` and `/mcp` via the platform's OAuth provider lib (Cloudflare adapter uses `@cloudflare/workers-oauth-provider` at top level). Enforce staff D1 role inside the apiHandler.
- [ ] Add optional `MediaStorage` or `DeferredHookDispatcher` only when the adapter supports those features.
- [ ] Verify the runtime package still has no platform-specific imports.

## Current non-goals

- Do not add `SessionRepository`, `OAuthVerifier`, `UserRepository`, or `StaffRepository` runtime ports. Those were pre-ADR-0014 concepts and are not part of the current adapter contract.
- Do not add a second canonical migration chain for a new adapter. The runtime owns canonical migrations; adapters execute them through `DatabaseDriver.migrations`.
