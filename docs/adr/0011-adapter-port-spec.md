# ADR-0011: Adapter port spec

**Status:** Accepted for v0.1.0. New ADR. Replaces the architectural concerns previously tracked in POC ADR-0015 (`cms-astro` internal seam discipline).

**Date:** 2026-05-04

## Context

`@aotter/mantle-runtime` is adapter-agnostic. It owns dispatcher, entry-writer, view executor, content-ops, render pipeline, auth, and MCP. It depends only on `@aotter/mantle-spec` and a small set of TypeScript interfaces it defines itself.

`@aotter/mantle-cloudflare` is the only adapter shipping in v0.1.0. It binds the runtime's interfaces against Cloudflare Workers' D1, KV, ASSETS, and `@cloudflare/workers-oauth-provider`.

`@aotter/mantle-netlify` is a v0.2 stub — README only. It exists in the package layout as an engineering forcing function: with N=1 adapter, "adapter-agnostic" silently rots in PR review (a `D1Database` import slips into runtime, then a second, then five). With a second adapter visible in the workspace (even if its impl is a TODO), reviewers have somewhere to point when blocking the slip.

This ADR fixes the contract so:
- Future adapter authors have a stable target.
- PR reviewers can mechanically check "does this commit add a CF-specific type to runtime?"
- The runtime can refactor freely as long as the port shapes stay stable.

The POC accumulated multiple half-decisions about this seam (POC ADR-0015 documented an aspirational `cms-astro`-internal discipline; POC ADR-0029 retired Astro and dissolved the seam; the rebuild closes it properly).

## Decision

**Seven ports**, defined as TypeScript interfaces in `@aotter/mantle-runtime/src/domain/port/`. Concrete adapters provide implementations and inject them at module init via a single factory call.

| Port | Surface |
|---|---|
| `DatabaseDriver` | All persistent state — `entries`, `site_config`, `staff`, `users`, `approvals`, plus migrations. |
| `KvCache` | Publish-pipeline cache — pre-rendered HTML, `.md` mirrors, `llms.txt` per locale. Read-mostly, written by the publish pipeline. |
| `SessionRepository` | Cookie-session state — staff session lookup, OAuth state, MCP session. |
| `AssetServer` | Static-asset serving for the admin SPA. The runtime hands the adapter an asset path + `Request`; the adapter returns a `Response` with the right MIME and caching. |
| `OAuthVerifier` | MCP OAuth provider with Dynamic Client Registration. Responsible for the `/oauth/{token,register}` and `/.well-known/oauth-*` surfaces. |
| `UserRepository` | User identity — upsert by GitHub profile, store/read GitHub access token. |
| `StaffRepository` | Staff roster — list all, read by user id, bootstrap first owner. |

### `DatabasePort`

```ts
// packages/mantle-runtime/src/ports/database.ts (intent — exact shape lands in commit 4)
export interface DatabasePort {
  /** Run a parameterised query. Returns a typed result-set object — adapters
   *  normalise their native driver into this shape. */
  prepare(sql: string): PreparedStatement;
  /** Multi-statement transaction. Adapters guarantee atomicity. */
  batch(stmts: ReadonlyArray<PreparedStatement>): Promise<BatchResult[]>;
  /** Migration runner — invoked by `bootInit` once per isolate. */
  migrations: MigrationRunner;
}
```

The runtime never sees `D1Database`, `Pool` (postgres), or any concrete driver. The `prepare` / `batch` shape is intentionally close to D1's surface (which is itself close to the SQLite C API) — that's the smallest common denominator. Adapters wrap their native driver to this shape.

The CF adapter's impl is a thin proxy over `env.DB` (D1). A future Postgres-via-Hyperdrive adapter wraps `pg` to the same shape; a Netlify adapter could wrap Neon, Supabase, or PlanetScale.

### `KvPort`

```ts
export interface KvPort {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  /** List keys with a prefix — used by sitemap / llms.txt aggregation. */
  list(prefix: string): Promise<{ keys: string[]; cursor: string | null }>;
}
```

CF adapter: Workers KV. Future: Redis, FS, S3-compatible store.

### `SessionPort`

```ts
export interface SessionPort {
  read(token: string): Promise<Session | null>;
  write(session: Session): Promise<void>;
  invalidate(token: string): Promise<void>;
}
```

CF adapter: D1-backed session table (same `DatabasePort` instance, but the runtime has its own typed surface so callers don't write SQL). Future: signed JWT (no read-back), Redis, etc.

`SessionPort` looks like a redundant abstraction over `DatabasePort` for the CF case — it isn't. SessionPort lets adapters use a fast / cheap session store (Redis, signed cookies) without touching the canonical DB. The CF impl happens to use D1 for v0.1.0 simplicity.

### `AssetsPort`

```ts
export interface AssetsPort {
  /** Resolve a request to a static asset (typically under `/admin/assets/*`).
   *  Returns null if the asset doesn't exist — the adapter's HTTP layer
   *  then falls back to the SPA catchall. */
  fetch(req: Request): Promise<Response | null>;
}
```

CF adapter: wraps `env.ASSETS.fetch(req)`. Future: filesystem read, S3+CDN, Netlify static-publish dir.

The admin SPA itself lives in `@aotter/mantle-admin-ui` as a pre-built `dist/`. The adapter binds `AssetsPort` to whatever serves that `dist/`; the runtime knows nothing about static asset serving except "ask the port and pass through the response."

### `OAuthPort`

```ts
export interface OAuthPort {
  /** Verify an MCP request's bearer token against the provider's state. */
  verifyAccessToken(req: Request): Promise<OAuthIdentity | null>;
}
```

> **Refinement (commit 4):** an earlier draft of this ADR also declared `mount(framework: AdapterFrameworkContext): void` on the port. The runtime never had a use for `AdapterFrameworkContext` — mounting `/oauth/token`, `/oauth/register`, `/.well-known/oauth-*`, and the consent UI is the adapter's HTTP-framework job (the CF adapter binds `@cloudflare/workers-oauth-provider` directly to its Hono app), and surfacing the framework type through the runtime would have leaked HTTP-shape into a port that exists for the verify boundary. Dropped. Adapters are responsible for mounting their OAuth surface; the port covers only the verify path the runtime actually invokes.

CF adapter: `@cloudflare/workers-oauth-provider` (DCR-compliant, KV-backed). Future: standalone oauth2 lib, Hydra, Auth0, etc.

This is the most adapter-shaped port — different runtimes have different OAuth conventions, and the spec deliberately doesn't try to unify the wire-level semantics (DCR + JSON-RPC + transparency log all emerge from the CF OAuth provider's specifics; v0.2's Netlify port may reasonably look different in flow, just compatible at the verify-bearer-token boundary).

## How adapters wire ports

```ts
// (intent — exact shape lands in commit 6)
import { createCmsRuntime } from "@aotter/mantle-runtime";
import { d1DatabasePort } from "./ports/database.js";
import { kvKvPort } from "./ports/kv.js";
import { d1SessionPort } from "./ports/session.js";
import { workersAssetsPort } from "./ports/assets.js";
import { workersOAuthPort } from "./ports/oauth.js";

export function mountAdmin(app: Hono, config: CmsConfig): Hono {
  const runtime = createCmsRuntime({
    db: d1DatabasePort(env.DB),
    kv: kvKvPort(env.RENDER_KV),
    session: d1SessionPort(env.DB),
    assets: workersAssetsPort(env.ASSETS),
    oauth: workersOAuthPort(env.OAUTH_KV),
  });
  // ... wire runtime to Hono routes
  return app;
}
```

The runtime gets the 7 ports as a constructor object. There's no module-global state holding adapter-specific bindings (POC's `db-init.ts > stashedSiteDefaults` was the closest thing to that and survived only because the stash was framework-agnostic; with explicit ports there's no temptation to add module globals).

## Consequences

**Hard-enforced boundaries**:
- `@aotter/mantle-runtime` MUST NOT import `D1Database`, `KVNamespace`, `Fetcher` (CF Workers ASSETS), `@cloudflare/*`, or any other adapter-specific type. CI will lint for this; PR reviewers can grep.
- A new port can be added only by amending this ADR and updating ALL adapters (CF + Netlify stub) in the same change. The Netlify stub's README must reflect new ports too.
- Removing a port is also possible (if a port is found to overlap or be unnecessary), again by amending this ADR.

**Discoverability for adapter authors**:
- A future Bun/Deno/Vercel/Netlify port author reads this ADR + reads the 7 port interface files in `mantle-runtime/src/domain/port/` + writes 7 port impl files. That's the contract. No hidden state, no implicit assumptions about the HTTP framework.

**Test ergonomics**:
- Each port is small and isolated. Tests can mock individual ports without spinning up D1 / KV / OAuth provider.
- The runtime's test suite exercises against in-memory port impls; the adapter's test suite exercises the binding against real CF resources via `wrangler dev` or live deploy.

**The Netlify stub's job**:
- The `@aotter/mantle-netlify` package's README declares a public commitment to an N>=2 adapter world. If a PR adds CF-specific code to runtime, reviewers point at the stub README and reject. The stub doesn't have to ship code to perform its function — its existence is the constraint.

## Alternatives considered

**(a) Single mega-port** — One `RuntimePorts` interface containing every method (db.prepare, kv.get, session.read, assets.fetch, oauth.verify, …). **Rejected**: leaks the entire surface onto every adapter. Adapter authors who only want to swap KV would have to touch the mega-port impl. Discrete ports keep change blast radius per port.

**(b) Concrete CF types in runtime** — Just `import type { D1Database } from "@cloudflare/workers-types"` directly into `mantle-runtime`. Treat "CF-only" as a v0.1.0 reality, defer the abstraction. **Rejected**: this is what the POC did (via `cms-server` having implicit assumptions about D1 shape) and it's the trap the rebuild exists to escape. Once concrete CF types land in runtime, removing them is a multi-PR uplift later. Cheaper to do it right at v0.1.0.

**(c) Function-injection (no interfaces, just functions)** — Runtime accepts a record of functions: `{ dbPrepare, kvGet, kvPut, sessionRead, … }`. **Rejected**: TypeScript interfaces are more discoverable (an adapter author IDE-jumps from `DatabasePort` to its surface; jumping from `dbPrepare` is harder). Interfaces also document grouping; functions don't.

**(d) Plugin pattern (each port is a separate package)** — `@aotter/mantle-port-database`, `@aotter/mantle-port-kv`, etc., and runtime depends on all five. **Rejected**: 5 ports are too few to warrant 5 packages. The current 5-package structure (spec / runtime / admin-ui / cloudflare / netlify) is already at the boundary of "too many"; splitting further increases the maintenance tax without useful benefit. Ports are TS interfaces in `mantle-runtime`'s `src/ports/` directory — that's enough.

**(e) gRPC / wire-protocol seam** — Make ports a network protocol so adapters can be in any language. **Rejected**: the runtime is not an external service, it's a TypeScript library that adapters compose into a single Worker / Function. Network seam adds latency, deployment complexity, and operational surface for zero authoring benefit. The 5 ports are in-process; they always will be.

## How to apply

When you're authoring `@aotter/mantle-runtime` code:

1. If you reach for a CF-specific type, **stop**. Define a method on a port instead.
2. If a port is missing the method you need, **amend this ADR first** in the same PR, then add the method. Adapters in the same PR.
3. Tests must use port mocks (in-memory implementations) — never reach into a real D1 / KV from runtime tests.

When you're authoring an adapter (`@aotter/mantle-cloudflare` for v0.1.0; future `mantle-netlify`, `mantle-bun`, …):

1. Read `mantle-runtime/src/ports/`. Implement each port against your runtime's primitives.
2. Compose the runtime via `createCmsRuntime({ db, kv, session, assets, oauth })`.
3. Bind to your HTTP framework — Hono on CF, Netlify Functions handler, raw `fetch` Worker, …
4. Bundle `@aotter/mantle-admin-ui`'s `dist/` via your runtime's static-asset surface and bind `AssetsPort` to it.

When you're reviewing a PR:

1. Grep the diff for `@cloudflare`, `D1Database`, `KVNamespace`, `Fetcher` — flag any occurrence in `mantle-runtime/`.
2. If a new port method shows up, check it's also reflected in this ADR + the Netlify stub README.
3. If a port shape changed, all 2 adapters (CF real, Netlify stub) get updated in the same PR.

## Implementation status

- [ ] Port interface files: `mantle-runtime/src/ports/{database,kv,session,assets,oauth}.ts` (commit 4)
- [ ] Port impls: `mantle-cloudflare/src/ports/*.ts` (commit 6)
- [ ] Netlify stub README references this ADR (already done in commit 1)
- [ ] CI lint: forbid `@cloudflare/*` / `D1Database` / `KVNamespace` imports in `mantle-runtime/` (post-v0.1.0; manual review until then)

## See also

- ADR-0007 — AI as primary author. Adapter port discipline serves the "AI debuggable" loop: a missing port method surfaces as a structured Diagnostic at boot, not a runtime 500 in production.
- ADR-0009 — consumer-supplied manifests. Manifests don't care about ports; ports don't care about manifests. The two abstractions compose cleanly.
