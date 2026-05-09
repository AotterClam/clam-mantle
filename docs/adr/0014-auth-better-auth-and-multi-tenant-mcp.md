# ADR-0014: Better Auth as the auth + MCP authorization server, scope-derived multi-tenant MCP

## Status

Accepted (new)

## Date

2026-05-09

## Context

The pre-v0.1.0 auth surface is a hand-rolled GitHub-only flow stitched out of two libraries:

- `@cloudflare/workers-oauth-provider` (DCR-compliant authorization server for MCP — `/oauth/{authorize,token,register}`, `.well-known/oauth-authorization-server`, KV-backed token storage)
- A hand-rolled GitHub upstream OAuth client (`oauth/githubOAuth.ts` ~110 LOC)
- D1 tables: `users`, `social_logins`, `sessions`, `github_tokens`, `staff` overlay
- `ensureBootstrapOwner` env-var gated (`ADMIN_GITHUB_LOGIN`)
- `cms_session` cookie carries the staff session
- Single `/mcp` route gated to staff bearers only

Pre-launch we promised the `publication` family then `community` and `fan-club` (#58 taxonomy). Both require:

1. **Multi-IDP end-user login** — GitHub, Google, Apple, plus magic link / email OTP for users without OAuth accounts
2. **End-user MCP access via DCR** — let signed-in end-users grant a Claude / Cursor / Codex agent read access to their own subscriptions, comments, member-only posts

Trying to grow the existing hand-rolled stack into that shape — three IDPs, two paths to magic link, account linking with reauth, scope-based MCP gating, role machinery for both staff and end-user, end-user DCR through `workers-oauth-provider` — accumulates fast (~1500 LOC of auth code by v0.2). Cloudflare itself does not ship a transactional-email-for-app-auth product (Cloudflare Access's "One-time PIN" gates Zero Trust resources, not public-site users), so the email-OTP path needs an external sender regardless.

The "single `/mcp` with config flags" pattern explodes combinatorially when scope, role, surface, and feature flags interact. Each new feature multiplies the matrix.

A 2026 Workers-friendly auth library — [Better Auth](https://better-auth.com) — covers this entire space:

- Identity / sessions / accounts (the obvious thing every auth library does)
- Multi-IDP via `socialProviders` (GitHub / Google / Apple / 30+ more)
- Magic link (`magicLink` plugin) and email OTP (`emailOTP` plugin) with pluggable email sender
- Role machinery (`admin` plugin, `user.role` field on user table)
- **OAuth 2.1 provider with DCR (`oauthProvider` plugin)** — full RFC 7591 dynamic client registration, RFC 7662 introspection, RFC 7009 revocation, scope-based access control, custom token claims, consent UI redirect customization
- **MCP plugin (`mcp`)** — purpose-built on top of the OAuth 2.1 provider for MCP DCR; auto-mounts `.well-known/oauth-authorization-server` + `.well-known/oauth-protected-resource`, exposes `auth.api.getMcpSession()` for protected-resource validation
- Account linking with policies (verified-email match + reauth requirement)

Better Auth depends on a Kysely / Drizzle / Prisma adapter for the database, not on any Cloudflare-specific service. The auth machinery becomes platform-agnostic — porting to Netlify / Bun / Deno is config-only.

## Decision

### 1. Better Auth replaces both layers

Adopt Better Auth as the SDK's full auth surface. It owns:

- `user` / `session` / `account` / `verification` D1 tables (replaces our `users` / `social_logins` / `sessions` / `github_tokens`)
- Cookie session (replaces `cms_session` with `better-auth.session_token`)
- Upstream OAuth clients for GitHub, Google, Apple via `socialProviders` (replaces `oauth/githubOAuth.ts`)
- Magic link plugin (replaces the `email_verifications` table we would otherwise hand-roll)
- Email OTP plugin
- `admin` plugin for role machinery (replaces the `staff` table — `user.role` carries the role string)
- **`oauthProvider` (or `mcp`) plugin for DCR-compliant authorization server** (replaces `@cloudflare/workers-oauth-provider`)

`@cloudflare/workers-oauth-provider` is removed entirely. The `OAUTH_KV` binding is no longer required. The whole `clam-cms-cloudflare/src/oauth/` directory disappears (singleton wiring, hand-rolled GitHub OAuth, consent HTML renderer with locale list — Better Auth's consent flow replaces).

The auth runtime stops being an adapter port. `OAuthVerifier` port + `WorkersOAuthVerifier` adapter are deleted. Validating bearer tokens at `/mcp` and `/staff/mcp` becomes `auth.api.getMcpSession(req.raw)` — a direct Better Auth API call, no port indirection.

This makes the runtime more platform-agnostic, not less: Better Auth runs on Workers (D1 via Kysely), Bun (sqlite), Node (postgres) without code changes. Future Netlify / partner adapters get the auth surface for free.

### 2. `staff` table → `user.role` via Better Auth admin plugin

The `admin` plugin stores a `role` field on the `user` table. Configure:

```ts
admin({
  defaultRole: "user",                                 // every end-user
  adminRoles: ["owner", "editor", "contributor"],      // our existing staff vocabulary
})
```

`ensureBootstrapOwner` becomes a `databaseHooks.user.create.after` that promotes the first user matching `ADMIN_GITHUB_LOGIN` to `owner` if no other admin role exists yet. The `staff` D1 table, `D1StaffRepository`, `StaffRepository` port, and `runtime.staff` are deleted.

The manifest grammar predicate `requires.auth.all: [{ "ctx.staff": ["editor"] }]` evaluates against `session.user.role` at runtime. Closed enum membership unchanged.

What we lose: `grantedBy` / `grantedAt` audit trail. v0.1.0 doesn't need this; v0.1.x can re-add via `additionalFields` on user, or via a separate append-only `staff_audit_log` table.

### 3. Two MCP routes, surface-derived from manifest predicate

`/mcp` and `/staff/mcp` are mounted side-by-side from boot. v0.1.0 ships the conservative partition: `/staff/mcp` exposes all staff authoring/lifecycle tools and requires `mcp:staff` plus an admin role; `/mcp` exposes only read-only `query_view_<name>` tools and requires `mcp:read`. The v0.2+ extension point is **automatic** surface partition derived from each Procedure's `requires.auth.all` predicate:

```
predicate contains ctx.staff: [...]    → tool exposed on /staff/mcp only
predicate only ctx.user / no predicate → tool exposed on /mcp only
```

Tool partition rules:

- Per-collection auto-emitted authoring tools (`create_draft_<schema>`, `update_draft_<schema>`) — predicate baked-in to require `ctx.staff: [contributor+]`; route to `/staff/mcp`
- `list_entries` / `get_entry` / `request_publish` / `archive_entry` / `unpublish_entry` — staff-only (return drafts, mutate state); `/staff/mcp` only
- `query_view_<name>` (auto-emitted from each parsed View, mirroring the existing `/api/views/<name>` REST shape) — public; `/mcp` only
- v0.2 community / v0.2.x fan-club user-facing writes (comment, reaction, subscribe, ...) — predicate `ctx.user` or `ctx.user.subscription`; `/mcp`

### 4. Scope-aware DCR via Better Auth `oauthProvider`

Better Auth's `oauthProvider` plugin handles DCR. Configure:

```ts
oauthProvider({
  scopes: ["mcp:staff", "mcp:read"],
  clientRegistrationDefaultScopes: ["mcp:read"],
  clientRegistrationAllowedScopes: ["mcp:staff", "mcp:read"],
  validAudiences: [
    "https://<worker>/staff/mcp",
    "https://<worker>/mcp",
  ],
  consentPage: "/auth/consent",
  customAccessTokenClaims: ({ user, scopes }) => ({
    role: user.role,
  }),
})
```

Consent UI semantics:

- `mcp:staff` requested — only admin-role users can approve. Non-admin sessions see "you need to be staff to grant this scope."
- `mcp:read` requested — any signed-in user can approve.
- Mixed `["mcp:staff", "mcp:read"]` — admin-role users grant both; non-admin users grant only `mcp:read` with a notice.

The consent page (`/auth/consent`) is consumer-rendered; SDK ships a minimal HTML fallback for starters that don't customize.

Each MCP route validates token scope at request time via `auth.api.getMcpSession()`:

- `/staff/mcp` requires `mcp:staff` ∈ session.scopes
- `/mcp` requires `mcp:read` ∈ session.scopes (`mcp:staff` accepted as superset)

The Better Auth MCP plugin exposes the RFC 9728 protected-resource metadata document at the auth mount (`/api/auth/.well-known/oauth-protected-resource` in the Cloudflare starter). Both `/staff/mcp` and `/mcp` point unauthenticated clients at that metadata document through `WWW-Authenticate`.

### 5. Role checked dynamically, not embedded in token

The token can carry `role` via `customAccessTokenClaims` for caller convenience, but the **MCP route validators always re-read `user.role` fresh** via the session. Cost: ~1ms D1 lookup per request (Better Auth's session cache absorbs most of this). Win: a demoted user is locked out immediately, not at token expiry. Same pattern for the consent UI staff gate.

### 6. Single auth surface, no port indirection

Auth is no longer an adapter port. `clam-cms-runtime` does NOT define an auth port. The runtime accepts a Better Auth instance (or a thin abstraction) directly from the adapter at boot:

```ts
createCmsRuntime({
  ...,
  auth: betterAuthInstance,
})
```

Adapter packages (`clam-cms-cloudflare`, future `clam-cms-netlify`) construct the Better Auth instance with the right database adapter for their platform and pass it in. The runtime calls `auth.api.getSession()` / `auth.api.getMcpSession()` / `auth.api.getUser()` — Better Auth's surface stays the same across adapters.

This is a minor amendment to ADR-0011 (adapter port spec): the auth port disappears, replaced by direct Better Auth dependency. The hard invariant ("`clam-cms-runtime` MUST NOT import `D1Database` / `KVNamespace`") is preserved — Better Auth's runtime surface is platform-agnostic.

## Consequences

### What gets deleted

- `clam-cms-cloudflare/src/oauth/` entire directory (`githubOAuth.ts`, `consentHtml.ts`, `oauthSingleton.ts`, `oauthConstants.ts`, `index.ts`)
- `clam-cms-cloudflare/src/bindings/D1UserRepository.ts`
- `clam-cms-cloudflare/src/bindings/D1SessionRepository.ts`
- `clam-cms-cloudflare/src/bindings/D1StaffRepository.ts`
- `clam-cms-cloudflare/src/bindings/WorkersOAuthVerifier.ts`
- `clam-cms-cloudflare/src/bindings/StubOAuthVerifier.ts`
- `clam-cms-runtime/src/domain/port/UserRepository.ts`
- `clam-cms-runtime/src/domain/port/SessionRepository.ts`
- `clam-cms-runtime/src/domain/port/StaffRepository.ts`
- `clam-cms-runtime/src/domain/port/OAuthVerifier.ts`
- `clam-cms-runtime/src/runtime.ts` `users` / `sessions` / `staff` / `oauth` ports
- `mountServerEndpoints.ts` `/admin/auth/github` + callback (Better Auth handles), session cookie read/write code, `ensureBootstrapOwner` inline logic (moves to hook), OAuth consent UI handlers (`/oauth/authorize` GET/POST), OAuth provider passthrough (`/oauth/token`, `/oauth/register`, `.well-known/*`)
- D1 tables: `users`, `social_logins`, `sessions`, `github_tokens`, `staff`
- `OAUTH_KV` binding (no longer required in `wrangler.toml`)
- `@cloudflare/workers-oauth-provider` dependency

### What stays

- `mount/mountMcp.ts` — refactored to mount both `/mcp` + `/staff/mcp`, validates via `auth.api.getMcpSession()`, and enforces route scopes.
- `infrastructure/mcp/McpJsonRpcDispatcher.ts` — refactored to support staff vs public tool catalogs.
- All entries / publish / view machinery (zero auth-related changes)
- Admin SPA — sign-in view rewritten to redirect to Better Auth route; identity / role queries use Better Auth client

### What gets added

- Better Auth library + Kysely + `kysely-d1` packages (or whichever D1 adapter Better Auth recommends current)
- Better Auth instance at `clam-cms-cloudflare/src/auth.ts` (factory taking env / D1 binding)
- New `EmailSender` port + `ResendEmailSender` adapter impl (used by Better Auth `magicLink` / `emailOTP` plugins)
- `databaseHooks.user.create.after` for `ensureBootstrapOwner` semantics
- Two `/.well-known/oauth-protected-resource/*` metadata endpoints (Better Auth helpers)
- Public View MCP tools: dispatcher emits `query_view_<name>` on `/mcp`.
- Future manifest grammar tools: dispatcher will read `Procedure.requires.auth.all` to route user-facing tools to `/mcp` or `/staff/mcp`.
- Skills + docs updates for the dual MCP URL handoff

### Backward compatibility

None. Pre-v0.1.0 has no external consumers. Existing demo deployments tear down + re-bootstrap from the migrated `0.0.x-alpha` release.

### Skills + prompts

`docs/prompts/publication.{en,zh-TW}.md` reference `<worker_url>/staff/mcp` for staff-targeted MCP handoff. `skills/install/SKILL.md` and `skills/provision/SKILL.md` document the dual handoff. Provision Skill's final report distinguishes:

```
Public site:    https://<worker>.workers.dev/
Staff MCP URL:  https://<worker>.workers.dev/staff/mcp     (give to your owner agent)
User MCP URL:   https://<worker>.workers.dev/mcp           (give to visitors / their agents)
```

`starters/publication/README.md` § "Production smoke recipe" updates to use `/staff/mcp` for the MCP operator smoke step.

### Future-proof for v0.2

The end-user MCP via DCR + role-gated content (community / fan-club) requires no architectural change — just:

- Enable Better Auth `socialProviders.google` / `.apple` (config-only)
- Enable `magicLink` and `emailOTP` plugins (config + `EmailSender` wiring already in place)
- Promote DRAFT manifest grammar from POC ADR-0005 — `Schema.spec.policies.readable: ctx.user` and `requires.auth.all: [{ ctx.user.subscription: [premium] }]`
- Add `additionalFields: { subscriptionTier: ... }` on user when Stripe entitlement lands

No config flag flips, no surface migration. The dispatcher partition rule (predicate → surface) handles new tool emission automatically.

### Platform agnosticism

By removing `@cloudflare/workers-oauth-provider` and routing auth through Better Auth, the SDK no longer depends on any CF-specific auth service. A future Netlify adapter constructs a Better Auth instance backed by a Netlify-compatible D1 / postgres / sqlite database; the rest of the runtime + dispatcher + skills + prompts work unchanged. ADR-0011 (adapter port spec) is amended: the `OAuthVerifier` port disappears; auth becomes a direct constructor argument with platform-agnostic Better Auth as the type.

## Alternatives considered

### Alt-A: Hand-rolled multi-IDP without a library

Continue the existing `oauth/githubOAuth.ts` pattern, write `googleOAuth.ts` and `appleOAuth.ts`, wire account-linking by hand, keep `workers-oauth-provider` for DCR.

**Rejected** — Apple Sign In's JWT-signed client secret rotation (every 6 months) is non-trivial; account-linking with reauth flow has security pitfalls; magic-link / email-OTP adds 200+ LOC of token storage + send + verify per flow. Total scope is ~1500 LOC of auth code for v0.2. Better Auth covers this with config + plugins.

### Alt-B: arctic library for upstream IDPs, keep `workers-oauth-provider` for DCR

Use [arctic](https://arcticjs.dev) for upstream IDP clients, keep our existing `users` / `social_logins` / `sessions` / `staff` schema, hand-roll session management + account linking + magic link, retain `workers-oauth-provider`.

**Rejected** — arctic only solves the OAuth client step (~150 LOC saved). Session management, role machinery, account linking with reauth, magic-link plugin — all still hand-rolled. `workers-oauth-provider` retained means we still glue two systems. Compared to Better Auth (which absorbs all of these into one), arctic forces more glue code AND keeps the platform coupling.

### Alt-C: Better Auth for upstream IDPs, keep `workers-oauth-provider` for DCR

Adopt Better Auth as identity / session / role authority. Keep `workers-oauth-provider` because it's a known-good DCR implementation.

**Rejected as of 2026-05-09** — initial draft of this ADR took this position. Web research showed Better Auth's `oauthProvider` and `mcp` plugins cover the DCR concern with full RFC 7591 / 7662 / 7009 / 9728 compliance. Keeping `workers-oauth-provider` would mean two systems sharing user identity but with different cookie / token / session caches — operationally messier than a single auth surface. The platform-agnosticism win (no CF-specific auth lib) tips the balance.

### Alt-D: Single `/mcp` with role + scope flags

Keep one MCP route. Gate with config flags: `mcpRequiresStaff`, `mcpAllowEndUser`, scope checks per tool.

**Rejected** — flag combinatorics explode as we add subscription tiers + per-collection visibility. Two routes derived from manifest predicate eliminates the flag matrix entirely; the rule is reviewable as a single sentence.

### Alt-E: Two separate Better Auth `oauthProvider` instances

One DCR provider for staff MCP, one for end-user MCP.

**Rejected** — two consent UIs, two token tables, double the configuration burden, no real benefit. Single auth server with scope-based gating achieves the same separation cleanly per the OAuth spec.

### Alt-F: `staff` table preserved alongside Better Auth user table

Keep our `staff` overlay and `D1StaffRepository`. Use Better Auth only for identity / session / account, route role machinery through staff overlay.

**Rejected** — duplicate role data (Better Auth `admin` plugin + our staff overlay) is worse than picking one. Audit trail is the only thing the standalone overlay buys, and v0.1.0 doesn't need it.

## Implementation status

Phase 0 (spike, 0.5–1d) — pending:

- Confirm Better Auth + `admin` plugin + `oauthProvider` (or `mcp`) plugin operational on D1 in Workers
- Confirm Better Auth's auto-mounted `.well-known/oauth-authorization-server` is reachable
- Confirm two `.well-known/oauth-protected-resource/*` metadata documents serve correctly (helper or hand-roll)
- Confirm DCR clients (Claude Code, Cursor) follow RFC 9728 path-prefix metadata
- Confirm `auth.api.getMcpSession()` validates bearer tokens at the protected-resource path
- Confirm `auth.api.getSession()` works inside consumer routes
- Bundle size delta on the worker

Phase 1 (migration, ~2d) — pending Phase 0:

- Better Auth integration (publication starter + clam-cms-cloudflare adapter)
- Schema cut-over (canonical migrations rewrite, drop legacy auth tables, add Better Auth tables)
- Drop `oauth/` directory, all auth ports, `WorkersOAuthVerifier`, `StubOAuthVerifier`
- Drop `@cloudflare/workers-oauth-provider` dep + `OAUTH_KV` binding
- Mount factories rewrite (`mountServerEndpoints` for admin gate, `mountMcp` for dual-route)
- Dispatcher refactor (per-tool surface routing from manifest predicate)
- Tests update (`mcp-smoke` → `staff-mcp-smoke` + new `public-mcp-smoke`)
- Skills + prompts + starter README updates
- Admin SPA sign-in view rewrite

Phase 2 (v0.1.x):

- Enable Google + Apple `socialProviders` (config-only — Apple needs Apple Developer cert setup which is consumer-side)
- Magic-link + email-OTP plugins enabled (need `ResendEmailSender` wired)
- Account-linking with reauth UI in publication starter

Phase 3 (v0.2+, with community / fan-club):

- POC ADR-0005 DRAFT grammar promotion: `Schema.spec.policies.readable`, `requires.auth.all: ctx.user.subscription[*]`
- Subscription tier on user (`additionalFields`)
- Stripe webhook → entitlement updater
- Community / fan-club starter manifests

## How to apply

When reviewing or implementing a change that touches auth, MCP routing, or roles:

1. **Identity / session / account state** — Better Auth API. Don't hand-write D1 reads against `user` / `session` / `account`. Use `auth.api.*`.
2. **Role check** — read `session.user.role` (from `auth.api.getSession()` or `auth.api.getMcpSession()`). Don't query a `staff` table; it doesn't exist.
3. **MCP tool routing** — let the dispatcher derive surface from `Procedure.requires.auth.all`. Don't add a per-tool `surface: 'staff' | 'public'` field; the predicate is the source of truth.
4. **DCR consent gating** — scope-based via Better Auth `oauthProvider` config. `mcp:staff` requires admin role; `mcp:read` accepts any signed-in user. Don't add a separate consent path or config flag.
5. **Token props** — minimal. If you need role in the token payload for caller convenience, add via `customAccessTokenClaims`, but always re-validate fresh on the server side.
6. **Email** — call `EmailSender` port. CF adapter binds Resend; consumer can swap.
7. **Adapter portability** — the auth surface is platform-agnostic. A new adapter (Netlify / Bun / Deno) constructs Better Auth with its preferred DB adapter and passes the instance to the runtime. No port re-implementation needed.

## Sources

- [Better Auth MCP plugin docs](https://better-auth.com/docs/plugins/mcp)
- [Better Auth OAuth 2.1 Provider plugin docs](https://better-auth.com/docs/plugins/oauth-provider)
- [Better Auth admin plugin docs](https://better-auth.com/docs/plugins/admin)
- [Better Auth changelog (1.5+)](https://better-auth.com/blog/1-5)
- [RFC 7591 — Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 9728 — Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
