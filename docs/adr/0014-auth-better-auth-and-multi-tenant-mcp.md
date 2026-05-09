# ADR-0014: Better Auth + scope-aware multi-tenant MCP

## Status

Accepted (new)

## Date

2026-05-09

## Context

The pre-v0.1.0 auth surface is a hand-rolled GitHub-only flow:

- `/admin/auth/github` + `/admin/auth/github/callback` — ~110 LOC of upstream OAuth client code in `mantle-cloudflare/src/oauth/githubOAuth.ts`
- D1 tables: `users`, `social_logins`, `sessions`, `github_tokens`, `staff` overlay
- `ensureBootstrapOwner` env-var gated (`ADMIN_GITHUB_LOGIN`)
- `cms_session` cookie carries the staff-shaped session
- A separate `@cloudflare/workers-oauth-provider` instance issues tokens for MCP DCR (`/oauth/{authorize,token,register}`, `.well-known/oauth-authorization-server`)
- Single `/mcp` route mounted by `mountMcp(app, ref)`; gated server-side to staff bearers only

Pre-launch we promised the publication starter family then `community` and `fan-club` (#58 taxonomy). Both require:

1. **Multi-IDP end-user login** — GitHub, Google, Apple, plus magic link / email OTP for users without OAuth accounts.
2. **End-user MCP access** — let signed-in users grant a Claude / Cursor / Codex agent read access to their own subscriptions, comments, member-only posts.

Trying to grow the existing hand-rolled stack into that shape — three IDPs, two paths to the magic link, account linking with reauth, scope-based MCP gating, role machinery for both staff and end-user — accumulates fast. A 2024–2026 Workers ecosystem trade-off:

- Off-the-shelf libraries cover most of this (arctic, lucia, Better Auth, Auth.js, ...). All are TypeScript-first; most have D1 / Workers adapters.
- Adding upstream-IDP plumbing one at a time is high boilerplate per IDP (Apple's JWT-signed client secret is the worst).
- Account linking with email collision detection + reauth flow is non-trivial and easy to get wrong (security implications).
- Email OTP / magic link adds an EmailSender port + transactional email integration.

Cloudflare itself does not ship a transactional-email-for-app-auth product. Cloudflare Access's "One-time PIN login" gates Zero Trust resources for org members, not for public-site end-users — wrong product. CF Email Workers exists in dev preview / restricted plans but isn't a general OTP product.

The "single `/mcp` with config flags" pattern (one route, role checks at request time, optional flags to open it to non-staff) explodes combinatorially when scope, role, surface, and feature flags interact. Each new feature multiplies the matrix.

## Decision

### 1. Better Auth as identity / session / account / role authority

Adopt [Better Auth](https://better-auth.com) as the SDK's auth library. It owns:

- `user` / `session` / `account` / `verification` D1 tables (replacing our `users` / `social_logins` / `sessions` / `github_tokens`)
- Cookie session (replacing `cms_session` with `better-auth.session_token`)
- Upstream OAuth clients for GitHub, Google, Apple via `socialProviders` (replacing `oauth/githubOAuth.ts`)
- Magic link plugin (replacing the `email_verifications` / `auth_tokens` table we would otherwise hand-roll)
- Email OTP plugin
- `admin` plugin for role machinery (replacing the `staff` table — `user.role` carries the role string)

Pre-v0.1.0 with no external consumers, the migration is a clean cut-over: drop existing schema, re-emit canonical migrations, replace mount-factory route handlers.

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

### 3. Two MCP routes, scope-derived

`/mcp` and `/staff/mcp` are mounted side-by-side from boot. Surface partition is **automatic**, derived from each Procedure's `requires.auth.all` predicate:

```
predicate contains ctx.staff: [...]    → tool exposed on /staff/mcp only
predicate only ctx.user / no predicate → tool exposed on /mcp only
```

Tool partition rules:

- Per-collection auto-emitted authoring tools (`create_draft_<schema>`, `update_draft_<schema>`) — predicate baked-in to require `ctx.staff: [contributor]`+; route to `/staff/mcp`
- `list_entries` / `get_entry` / `request_publish` / `archive_entry` / `unpublish_entry` — staff-only (return drafts, mutate state); `/staff/mcp` only
- `query_view_<name>` (auto-emitted from each parsed View, mirroring the existing `/api/views/<name>` REST shape) — public; `/mcp` only
- v0.2 community / v0.2.x fan-club user-facing writes (comment, reaction, subscribe, ...) — predicate `ctx.user` or `ctx.user.subscription`; `/mcp`

### 4. Scope-aware DCR consent

Single `workers-oauth-provider` mount unchanged at `/oauth/{authorize,token,register}` + `/.well-known/oauth-authorization-server`. The consent UI now examines requested scope:

- `mcp:staff` — only staff (admin-role) sessions can approve. Non-staff request returns 403 with `AUTH_DENIED` and an explanation.
- `mcp:read` — any signed-in user can approve.
- Mixed request `["mcp:staff", "mcp:read"]` — staff get both; non-staff get only `mcp:read` granted (with notice).

`workers-oauth-provider` carries scope on the issued token. Each MCP route validates token scope at request time:

- `/staff/mcp` requires `mcp:staff` ∈ token.scope
- `/mcp` requires `mcp:read` ∈ token.scope (`mcp:staff` also accepted as superset)

Two protected-resource metadata documents at:

- `/.well-known/oauth-protected-resource/staff/mcp`
- `/.well-known/oauth-protected-resource/mcp`

Both reference the same `/.well-known/oauth-authorization-server`. RFC 9728 path-prefix metadata.

### 5. Role checked dynamically, not embedded in token

Token `props` carry `userId` only. Each MCP request reads `user.role` fresh from Better Auth. Cost: ~1ms D1 lookup per request. Win: a demoted user is locked out immediately, not at token expiry. Same pattern for the consent UI staff gate.

### 6. workers-oauth-provider stays for DCR; not replaced by Better Auth

Better Auth is an OAuth **client** (consuming GitHub / Google / Apple as upstream IDPs). It is not a DCR-compliant **authorization server** for downstream MCP clients. `workers-oauth-provider` is the right tool for that surface; it's not a duplicated concern.

The two systems share the user identity (Better Auth `user.id`) — when the consent UI approves an MCP grant, it embeds Better Auth's `user.id` into the OAuth provider's token props. Each MCP request resolves the userId back to a Better Auth user, reads the live role + future fields (subscription tier).

## Consequences

### What gets deleted

- `mantle-cloudflare/src/oauth/githubOAuth.ts` (entire)
- `mantle-cloudflare/src/bindings/D1UserRepository.ts` (entire — Better Auth owns)
- `mantle-cloudflare/src/bindings/D1SessionRepository.ts` (entire)
- `mantle-cloudflare/src/bindings/D1StaffRepository.ts` (entire)
- `mantle-runtime/src/domain/port/UserRepository.ts` (Better Auth API replaces)
- `mantle-runtime/src/domain/port/SessionRepository.ts` (Better Auth API replaces)
- `mantle-runtime/src/domain/port/StaffRepository.ts` (no separate staff layer)
- `mantle-runtime/src/runtime.ts` `users` / `sessions` / `staff` ports
- `mountServerEndpoints.ts` `/admin/auth/github` + callback (Better Auth handles), session cookie read/write code, `ensureBootstrapOwner` inline logic (moves to hook)
- D1 tables: `users`, `social_logins`, `sessions`, `github_tokens`, `staff`
- `OAUTH_KV` state-token `oauth_state:` entries (Better Auth does its own state)

### What stays

- `workers-oauth-provider` configuration in `oauth/oauthSingleton.ts`
- `oauth/consentHtml.ts` (consent UI rendering, locale list — handler that mounts it changes)
- `bindings/WorkersOAuthVerifier.ts` (MCP `/mcp` + `/staff/mcp` bearer validator)
- `domain/port/OAuthVerifier.ts` (port shape)
- `mount/mountMcp.ts` — refactored to mount both surfaces
- `infrastructure/mcp/McpJsonRpcDispatcher.ts` — refactored to support per-tool surface routing

### What gets added

- Better Auth library + D1 adapter (Kysely-D1 underneath)
- New `EmailSender` port + `ResendEmailSender` adapter impl (used by Better Auth magic-link / email-OTP plugins)
- Better Auth's `databaseHooks.user.create.after` for `ensureBootstrapOwner` semantics
- Two `/.well-known/oauth-protected-resource/*` metadata endpoints (handwritten if `workers-oauth-provider` doesn't natively support multiple)
- Manifest grammar tools: dispatcher reads `Procedure.requires.auth.all` to route tools to `/mcp` or `/staff/mcp`
- Skills + docs updates for the dual MCP URL handoff

### Backward compatibility

None. Pre-v0.1.0 has no external consumers. Existing demo deployments (if any) are torn down and re-bootstrapped from the npm packages of the migrated `0.0.x-alpha` release.

### Skills + prompts

`docs/prompts/publication.{en,zh-TW}.md` reference `<worker_url>/staff/mcp` for staff-targeted MCP handoff. `skills/install/SKILL.md` and `skills/provision/SKILL.md` document the dual handoff. The provision Skill's final report distinguishes:

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

## Alternatives considered

### Alt-A: Hand-rolled multi-IDP without a library

Continue the existing `oauth/githubOAuth.ts` pattern, write `googleOAuth.ts` and `appleOAuth.ts`, wire account-linking by hand.

**Rejected** — Apple Sign In's JWT-signed client secret rotation (every 6 months) is non-trivial; account-linking with reauth flow has security pitfalls; magic-link / email-OTP adds 200+ LOC of token storage + send + verify per flow. Total scope is ~1500 LOC of auth code for v0.2. Better Auth covers this with config + plugins.

### Alt-B: arctic library only (OAuth client, BYO session)

Use [arctic](https://arcticjs.dev) for upstream IDP clients, keep our existing `users` / `social_logins` / `sessions` / `staff` schema, hand-roll session management + account linking + magic link.

**Rejected** — arctic only solves the OAuth client step (~150 LOC saved). Session management, role machinery, account linking with reauth, magic-link plugin — all still hand-rolled. Compared to Better Auth (which solves all of these with a config), arctic forces more glue code.

### Alt-C: Single `/mcp` with role + scope flags

Keep one MCP route. Gate with config flags: `mcpRequiresStaff`, `mcpAllowEndUser`, scope checks per tool.

**Rejected** — flag combinatorics explode as we add subscription tiers + per-collection visibility. Two routes derived from manifest predicate eliminates the flag matrix entirely; the rule is reviewable as a single sentence.

### Alt-D: Two separate `workers-oauth-provider` instances

One DCR provider for staff MCP, one for end-user MCP.

**Rejected** — two consent UIs, two `OAUTH_KV` namespaces, double the configuration burden, no real benefit. Single auth server with scope-based gating achieves the same separation cleanly per the OAuth spec.

### Alt-E: `staff` table preserved alongside Better Auth user table

Keep our `staff` overlay and `D1StaffRepository`. Use Better Auth only for identity / session / account, route role machinery through staff overlay.

**Rejected** — duplicate role data (Better Auth's `admin` plugin + our staff overlay) is worse than picking one. Audit trail is the only thing the standalone overlay buys, and v0.1.0 doesn't need it.

## Implementation status

Phase 0 (spike, 0.5–1d) — pending:

- Confirm Better Auth + `admin` plugin operational on D1 in Workers
- Confirm `workers-oauth-provider` 0.4.x supports two protected-resource metadata documents (or hand-roll)
- Confirm DCR clients (Claude Code, Cursor) follow RFC 9728 path-prefix metadata
- Confirm `auth.api.getSession(req)` works inside the OAuth consent UI handler
- Bundle size delta on the worker (Better Auth bundles ~50–100 KB)

Phase 1 (migration, ~2d) — pending Phase 0:

- Better Auth integration (publication starter + mantle-cloudflare adapter)
- Schema cut-over (canonical migrations rewrite)
- Drop hand-rolled OAuth machinery
- Mount factories rewrite (`mountServerEndpoints` for admin gate, `mountMcp` for dual-route)
- Dispatcher refactor (per-tool surface routing from manifest predicate)
- Tests update (`mcp-smoke` → `staff-mcp-smoke` + new `public-mcp-smoke`)
- Skills + prompts + starter README updates
- Admin SPA sign-in view rewrite

Phase 2 (v0.1.x):

- Enable Google + Apple `socialProviders` (config-only — Apple needs Apple Developer cert setup which is consumer-side)
- Magic-link + email-OTP plugins enabled (need ResendEmailSender wired)
- Account-linking with reauth UI in publication starter

Phase 3 (v0.2+, with community / fan-club):

- POC ADR-0005 DRAFT grammar promotion: `Schema.spec.policies.readable`, `requires.auth.all: ctx.user.subscription[*]`
- Subscription tier on user (`additionalFields`)
- Stripe webhook → entitlement updater
- Community / fan-club starter manifests

## How to apply

When reviewing or implementing a change that touches auth, MCP routing, or roles:

1. **Identity / session / account state** — Better Auth API. Don't hand-write D1 reads against `user` / `session` / `account`. Use `auth.api.*`.
2. **Role check** — read `session.user.role` (from `auth.api.getSession()`) or `user.role` (from `auth.api.getUser({ userId })`). Don't query a `staff` table; it doesn't exist.
3. **MCP tool routing** — let the dispatcher derive surface from `Procedure.requires.auth.all`. Don't add a per-tool `surface: 'staff' | 'public'` field; the predicate is the source of truth.
4. **DCR consent gating** — scope-based. `mcp:staff` requires admin role; `mcp:read` accepts any signed-in user. Don't add a separate consent path or config flag.
5. **Token props** — `userId` only. Don't embed `role`. Read role fresh per request.
6. **Email** — call `EmailSender` port. CF adapter binds Resend; consumer can swap.
