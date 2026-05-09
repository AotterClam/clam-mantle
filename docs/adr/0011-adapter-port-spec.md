# ADR-0011: Adapter port spec

**Status:** Accepted for v0.1.0. New ADR. Replaces the architectural concerns previously tracked in POC ADR-0015 (`cms-astro` internal seam discipline).

**Date:** 2026-05-04 (revised 2026-05-09 to absorb ADR-0014).

**Update 2026-05-09:** ADR-0014 (Better Auth) replaces the four auth ports (`SessionRepository`, `OAuthVerifier`, `UserRepository`, `StaffRepository`) with a single `Auth` instance on `CmsConfig`. Required adapter ports drop from seven to three (`DatabaseDriver`, `KvCache`, `AssetServer`); auth lives in `@aotterclam/clam-cms-cloudflare/src/auth/createAuth.ts` not the runtime. The pre-revision sections below (`SessionRepository`, `OAuthVerifier`, the seven-port table, and the wiring example) are kept as historical context but no longer reflect shipped code.

## Context

`@aotterclam/clam-cms-runtime` is adapter-agnostic. It owns dispatcher, entry-writer, view executor, content-ops, render pipeline, auth, and MCP. It depends only on `@aotterclam/clam-cms-spec` and a small set of TypeScript interfaces it defines itself.

`@aotterclam/clam-cms-cloudflare` is the only adapter shipping in v0.1.0. It binds the runtime's interfaces against Cloudflare Workers' D1, KV, ASSETS, and supplies a Better Auth instance (per ADR-0014) for sign-in + MCP bearer validation.

`@aotterclam/clam-cms-netlify` is a v0.2 stub — README only. It exists in the package layout as an engineering forcing function: with N=1 adapter, "adapter-agnostic" silently rots in PR review (a `D1Database` import slips into runtime, then a second, then five). With a second adapter visible in the workspace (even if its impl is a TODO), reviewers have somewhere to point when blocking the slip.

This ADR fixes the contract so:
- Future adapter authors have a stable target.
- PR reviewers can mechanically check "does this commit add a CF-specific type to runtime?"
- The runtime can refactor freely as long as the port shapes stay stable.

The POC accumulated multiple half-decisions about this seam (POC ADR-0015 documented an aspirational `cms-astro`-internal discipline; POC ADR-0029 retired Astro and dissolved the seam; the rebuild closes it properly).

## Decision

**Seven ports**, defined as TypeScript interfaces in `@aotterclam/clam-cms-runtime/src/domain/port/`. Concrete adapters provide implementations and inject them at module init via a single factory call.

| Port | Surface |
|---|---|
| `DatabaseDriver` | All persistent state — `entries`, `site_config`, `staff`, `users`, `approvals`, plus migrations. |
| `KvCache` | Publish-pipeline cache — pre-rendered HTML, `.md` mirrors, `llms.txt` per locale. Read-mostly, written by the publish pipeline. |
| `SessionRepository` | Cookie-session state — staff session lookup, OAuth state, MCP session. |
| `AssetServer` | Static-asset serving for the admin SPA. The runtime hands the adapter an asset path + `Request`; the adapter returns a `Response` with the right MIME and caching. |
| `OAuthVerifier` | MCP OAuth provider with Dynamic Client Registration. Responsible for the `/oauth/{token,register}` and `/.well-known/oauth-*` surfaces. |
| `UserRepository` | User identity — upsert by GitHub profile, store/read GitHub access token. |
| `StaffRepository` | Staff roster — list all, read by user id, bootstrap first owner. |

Optional feature ports may also live in `domain/port/`, but they are
not part of the first-run adapter contract until a feature is enabled.
For v0.1.x media hosting:

| Optional port | Surface |
|---|---|
| `MediaStorage` | Object-storage-shaped media upload/commit/public URL/delete contract for **public** media. Cloudflare may implement with R2, but runtime must not import R2 types. |

These optional ports must not force first-run provisioning to create R2
resources. Publication starters can carry external image URLs without a
media storage implementation.

### Public vs private media — two buckets, two ports

`MediaStorage` deliberately models **public-only** semantics:

- `getPublicUrl()` returns an unconditional public URL. Reads bypass
  the Worker entirely (`MEDIA_PUBLIC_URL_BASE` → CDN → R2).
- `MediaAsset.publicUrl` is frozen at commit time and embedded directly
  into entry data (e.g. `posts.coverUrl`). This is intentional: for
  public assets the URL is permanent, the read path is hot, and adding
  a Worker round-trip on every render would defeat the cost / latency
  model.
- The CORS config on the underlying R2 bucket scopes browser PUTs to
  the admin origin only.

**Private content (subscription-gated, fan-club, signed-GET, etc.)
will be a *separate* port and a *separate* R2 bucket in v0.2.** Two
buckets, two ports — not one port with a `visibility` flag. Reasons:

1. **Bucket-level isolation.** Private bucket disables public access
   at the bucket level, so the worst-case "leaked private object" bug
   is structurally impossible.
2. **Different read paths.** Private reads MUST go through a Worker
   route (`/api/media/private/<key>` or similar) that runs the policy
   gate (staff predicate, subscription check, signed cookie, etc.)
   before resolving the object. The Worker either streams via
   `bucket.get()` or 302s to a short-lived signed GET URL.
3. **Different cost models.** Public bucket is CDN-cached, near-zero
   marginal cost. Private bucket charges Worker invocations on every
   read. Operator should opt into the cost knowingly, not by accident.
4. **Different MCP tool surface.** `create_private_media_upload` /
   `commit_private_media_upload` keeps the closed-list semantics of
   each tool tight. Agents pick the upload type explicitly.
5. **No migration debt.** Public assets stay public forever; their
   `coverUrl` strings remain valid. Private fields use a different
   schema field shape (`x-mcp-hint: private-media-image` over an
   opaque `assetId`, resolved at render time through the policy gate).
   No batch update over already-published entries.

Adding `PrivateMediaStorage` in v0.2 is a purely additive change to
the port set and the runtime. Current `MediaStorage` callers are
untouched. The Worker route, the use cases, the MCP tools, and the
adapter all live in their own module — they compose alongside the
public path rather than retrofitting it.

### `DatabaseDriver`

```ts
// packages/clam-cms-runtime/src/domain/port/DatabaseDriver.ts
export interface DatabaseDriver {
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

### `KvCache`

```ts
export interface KvCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  /** List keys with a prefix — used by sitemap / llms.txt aggregation. */
  list(prefix: string): Promise<{ keys: string[]; cursor: string | null }>;
}
```

CF adapter: Workers KV. Future: Redis, FS, S3-compatible store.

### `SessionRepository`

```ts
export interface SessionRepository {
  read(token: string): Promise<Session | null>;
  write(session: Session): Promise<void>;
  invalidate(token: string): Promise<void>;
}
```

CF adapter: D1-backed session table (same `DatabaseDriver` instance, but the runtime has its own typed surface so callers don't write SQL). Future: signed JWT (no read-back), Redis, etc.

`SessionRepository` looks like a redundant abstraction over `DatabaseDriver` for the CF case — it isn't. It lets adapters use a fast / cheap session store (Redis, signed cookies) without touching the canonical DB. The CF impl happens to use D1 for v0.1.0 simplicity.

### `AssetServer`

```ts
export interface AssetServer {
  /** Resolve a request to a static asset (typically under `/admin/assets/*`).
   *  Returns null if the asset doesn't exist — the adapter's HTTP layer
   *  then falls back to the SPA catchall. */
  fetch(req: Request): Promise<Response | null>;
}
```

CF adapter: wraps `env.ASSETS.fetch(req)`. Future: filesystem read, S3+CDN, Netlify static-publish dir.

The admin SPA itself lives in `@aotterclam/clam-cms-admin-ui` as a pre-built `dist/`. The adapter binds `AssetServer` to whatever serves that `dist/`; the runtime knows nothing about static asset serving except "ask the port and pass through the response."

### `OAuthVerifier`

```ts
export interface OAuthVerifier {
  /** Verify an MCP request's bearer token against the provider's state. */
  verifyAccessToken(req: Request): Promise<OAuthIdentity | null>;
}
```

> **Refinement (commit 4):** an earlier draft of this ADR also declared `mount(framework: AdapterFrameworkContext): void` on the port. The runtime never had a use for `AdapterFrameworkContext` — mounting `/oauth/token`, `/oauth/register`, `/.well-known/oauth-*`, and the consent UI is the adapter's HTTP-framework job (the CF adapter binds `@cloudflare/workers-oauth-provider` directly to its Hono app), and surfacing the framework type through the runtime would have leaked HTTP-shape into a port that exists for the verify boundary. Dropped. Adapters are responsible for mounting their OAuth surface; the port covers only the verify path the runtime actually invokes.

CF adapter: `@cloudflare/workers-oauth-provider` (DCR-compliant, KV-backed). Future: standalone oauth2 lib, Hydra, Auth0, etc.

This is the most adapter-shaped port — different runtimes have different OAuth conventions, and the spec deliberately doesn't try to unify the wire-level semantics (DCR + JSON-RPC + transparency log all emerge from the CF OAuth provider's specifics; v0.2's Netlify port may reasonably look different in flow, just compatible at the verify-bearer-token boundary).

## How adapters wire ports

```ts
// simplified Cloudflare adapter wiring (post-ADR-0014)
import { createCmsRef, mountServerEndpoints, mountMcp, createAuth } from "@aotterclam/clam-cms-cloudflare";
import {
  AssetsAssetServer,
  D1DatabaseDriver,
  KvCacheBinding,
} from "@aotterclam/clam-cms-cloudflare";

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const auth = createAuth({
      database: env.DB,
      baseURL: env.PUBLIC_ORIGIN,
      secret: env.BETTER_AUTH_SECRET,
      github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
      adminGithubLogin: env.ADMIN_GITHUB_LOGIN,
    });
    const cms = createCmsRef({
      manifests,
      handlers,
      bindings: {
        db: new D1DatabaseDriver(env.DB),
        kv: new KvCacheBinding(env.KV),
        assets: new AssetsAssetServer(env.ASSETS),
      },
      auth,
    });
    const app = new Hono();
    app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
    mountServerEndpoints(app, cms);
    mountMcp(app, cms);
    return app.fetch(req, env, ctx);
  },
};
```

The runtime gets three required adapter ports (`db`, `kv`, `assets`)
plus the Better Auth instance, alongside manifests, handlers,
templates, and site defaults. There's no module-global state holding
adapter-specific bindings (POC's `db-init.ts > stashedSiteDefaults`
was the closest thing to that and survived only because the stash was
framework-agnostic; with explicit
ports there's no temptation to add module globals).

## Consequences

**Hard-enforced boundaries**:
- `@aotterclam/clam-cms-runtime` MUST NOT import `D1Database`, `KVNamespace`, `Fetcher` (CF Workers ASSETS), `@cloudflare/*`, or any other adapter-specific type. CI will lint for this; PR reviewers can grep.
- A new required port can be added only by amending this ADR and updating ALL adapters (CF + Netlify stub) in the same change. Optional feature ports must be documented here and must state when adapters are required to implement them.
- Removing a port is also possible (if a port is found to overlap or be unnecessary), again by amending this ADR.

**Discoverability for adapter authors**:
- A future Bun/Deno/Vercel/Netlify port author reads this ADR + reads the 7 port interface files in `clam-cms-runtime/src/domain/port/` + writes 7 port impl files. That's the contract. No hidden state, no implicit assumptions about the HTTP framework.

**Test ergonomics**:
- Each port is small and isolated. Tests can mock individual ports without spinning up D1 / KV / OAuth provider.
- The runtime's test suite exercises against in-memory port impls; the adapter's test suite exercises the binding against real CF resources via `wrangler dev` or live deploy.

**The Netlify stub's job**:
- The `@aotterclam/clam-cms-netlify` package's README declares a public commitment to an N>=2 adapter world. If a PR adds CF-specific code to runtime, reviewers point at the stub README and reject. The stub doesn't have to ship code to perform its function — its existence is the constraint.

## Alternatives considered

**(a) Single mega-port** — One `RuntimePorts` interface containing every method (db.prepare, kv.get, session.read, assets.fetch, oauth.verify, …). **Rejected**: leaks the entire surface onto every adapter. Adapter authors who only want to swap KV would have to touch the mega-port impl. Discrete ports keep change blast radius per port.

**(b) Concrete CF types in runtime** — Just `import type { D1Database } from "@cloudflare/workers-types"` directly into `clam-cms-runtime`. Treat "CF-only" as a v0.1.0 reality, defer the abstraction. **Rejected**: this is what the POC did (via `cms-server` having implicit assumptions about D1 shape) and it's the trap the rebuild exists to escape. Once concrete CF types land in runtime, removing them is a multi-PR uplift later. Cheaper to do it right at v0.1.0.

**(c) Function-injection (no interfaces, just functions)** — Runtime accepts a record of functions: `{ dbPrepare, kvGet, kvPut, sessionRead, … }`. **Rejected**: TypeScript interfaces are more discoverable (an adapter author IDE-jumps from `DatabaseDriver` to its surface; jumping from `dbPrepare` is harder). Interfaces also document grouping; functions don't.

**(d) Plugin pattern (each port is a separate package)** — `@aotterclam/clam-cms-port-database`, `@aotterclam/clam-cms-port-kv`, etc., and runtime depends on one package per port. **Rejected**: the port set is too small to warrant per-port packages. The current 5-package structure (spec / runtime / admin-ui / cloudflare / netlify) is already at the boundary of "too many"; splitting further increases the maintenance tax without useful benefit. Ports are TS interfaces in `clam-cms-runtime`'s `src/domain/port/` directory — that's enough.

**(e) gRPC / wire-protocol seam** — Make ports a network protocol so adapters can be in any language. **Rejected**: the runtime is not an external service, it's a TypeScript library that adapters compose into a single Worker / Function. Network seam adds latency, deployment complexity, and operational surface for zero authoring benefit. The ports are in-process; they always will be.

## How to apply

When you're authoring `@aotterclam/clam-cms-runtime` code:

1. If you reach for a CF-specific type, **stop**. Define a method on a port instead.
2. If a port is missing the method you need, **amend this ADR first** in the same PR, then add the method. Adapters in the same PR.
3. Tests must use port mocks (in-memory implementations) — never reach into a real D1 / KV from runtime tests.

When you're authoring an adapter (`@aotterclam/clam-cms-cloudflare` for v0.1.0; future `clam-cms-netlify`, `clam-cms-bun`, …):

1. Read `clam-cms-runtime/src/domain/port/`. Implement each required port against your runtime's primitives.
2. Compose the runtime via `createCmsRuntime({ db, kv, sessions, assets, oauth, users, staff, manifests, ... })`.
3. Bind to your HTTP framework — Hono on CF, Netlify Functions handler, raw `fetch` Worker, …
4. Bundle `@aotterclam/clam-cms-admin-ui`'s `dist/` via your runtime's static-asset surface and bind `AssetServer` to it.

When you're reviewing a PR:

1. Grep the diff for `@cloudflare`, `D1Database`, `KVNamespace`, `Fetcher` — flag any occurrence in `clam-cms-runtime/`.
2. If a new port method shows up, check it's also reflected in this ADR + the Netlify stub README.
3. If a port shape changed, all 2 adapters (CF real, Netlify stub) get updated in the same PR.

## Implementation status

- [x] Required port interface files live in `packages/clam-cms-runtime/src/domain/port/*.ts`.
- [x] Cloudflare required port implementations live in `packages/clam-cms-cloudflare/src/bindings/*.ts`.
- [x] Optional feature port `MediaStorage` (public bucket) is declared but not required by first-run adapters. `PrivateMediaStorage` is v0.2.
- [x] Netlify stub README references this ADR.
- [ ] CI lint: forbid `@cloudflare/*` / `D1Database` / `KVNamespace` imports in `clam-cms-runtime/` (post-v0.1.0; manual review until then)

## See also

- ADR-0007 — AI as primary author. Adapter port discipline serves the "AI debuggable" loop: a missing port method surfaces as a structured Diagnostic at boot, not a runtime 500 in production.
- ADR-0009 — consumer-supplied manifests. Manifests don't care about ports; ports don't care about manifests. The two abstractions compose cleanly.
