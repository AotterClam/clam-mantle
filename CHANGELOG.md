# Changelog

All notable changes to clam-cms are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic versioning once public v0.1.0 tags begin. Pre-v0.1.0 alpha releases may still change public APIs.

## [Unreleased]

## [0.0.11-alpha.9] - 2026-05-19

### Breaking

- **`@aotterclam/mantle-spec`**: `SiteConfig` gains a required `media: { purposes: readonly string[] }` field (the runtime read shape; always present after seed, possibly empty). `SiteDefaults` (author-time, written in `clam.config.ts`) gains an optional `media?: { purposes?: readonly string[] }`. Consumers constructing a `SiteConfig` literal must include `media: { purposes: [] }` at minimum (#262 / #263). Boot-time `assertSiteDefaultsCanonical` now also throws `InvalidMediaPurposesError` if any declared purpose fails the `^[a-z0-9]+(-[a-z0-9]+)*$` slug shape.
- **`@aotterclam/mantle-runtime`**: `create_media_upload` is now fail-closed on purpose. Calls with a `purpose` not in `siteDefaults.media.purposes`, with a missing `purpose`, or against a deployment that declared no purposes at all are rejected with the new `MEDIA_PURPOSE_REJECTED` diagnostic (HTTP 400). Deployments that previously relied on the unrestricted free-form `purpose` string must declare their taxonomy in `clam.config.ts > siteDefaults.media.purposes` before upgrading. There is no warn-and-allow compatibility mode.
- **`@aotterclam/mantle-runtime`**: `CreateMediaUploadUseCase` constructor signature gains a `SiteConfigRepository` parameter between `clock` and `opts`. Adopters that construct the use case directly (not via `createCmsRuntime`) need to update the call site.
- **`@aotterclam/mantle-runtime`**: `McpUseCases.media` (used by adopters wiring `McpJsonRpcDispatcher` directly) gains a required `purposes: readonly string[]` field. The dispatcher reads it to mark `create_media_upload`'s `purpose` schema as `required` + emits the declared purposes as an `enum`, so agents see the right contract via `tools/list`.

### Added

- **`@aotterclam/mantle-spec`**: new exports `SiteMediaConfig`, `SiteMediaDefaults`, `MEDIA_PURPOSE_SLUG_PATTERN`, `InvalidMediaPurposesError`, `MEDIA_PURPOSE_REJECTED` diagnostic code (HTTP 400 mapping).
- **`@aotterclam/mantle-runtime`**: new port method `SiteConfigRepository.readMediaPurposes()`. `DatabaseSiteConfigRepository` seeds + loads the declared set via the same `INSERT … ON CONFLICT DO NOTHING` discipline as other site config keys, so operator edits via admin Settings stay sticky across deploys.
- **`@aotterclam/mantle-cloudflare`**: `createMcpApiHandler` rebuilds the MCP tool catalog when `site_config.mediaPurposes` changes within the same isolate. Operator edits take effect without a redeploy; tools/list reflects the current taxonomy.

### Changed

- **`@aotterclam/mantle-cloudflare`**: `create_media_upload` / `commit_media_upload` MCP tools are hidden from `tools/list` when either `mediaStorage` is unbound OR `siteDefaults.media.purposes` is empty (previously only the former). Symmetric "no first-party media uploads" gate.
- **`@aotterclam/mantle-cloudflare`**: `create_media_upload` MCP schema marks `purpose` as required and emits the declared `siteDefaults.media.purposes` as a JSON Schema `enum` so agents reading `tools/list` self-correct without a round trip.

## [0.0.9-alpha] - 2026-05-15

### Breaking

- **`@aotterclam/mantle-cloudflare`**: MCP OAuth surface carved out from Better Auth's `mcp()` plugin to `@cloudflare/workers-oauth-provider`. Better Auth keeps owning staff sign-in (D1 session, role, social/email-OTP/magic-link), but the OAuth AS surface (`/.well-known/oauth-*`, DCR, PKCE, token issue) is now served by `OAuthProvider` at the top level of the worker module. **Adopter migration**: `export default new Hono({...}).fetch` → `export default new OAuthProvider({...})`, where the Hono app becomes `defaultHandler` and each MCP endpoint becomes an entry in `apiHandlers`. New SDK exports: `createOAuthProvider`, `createMcpApiHandler`, `mountAuthorize`. Removed: `mountMcp`, `mountOAuthEndpoints`, `WorkersOAuthVerifier` (the lib does bearer verification internally before calling `apiHandler.fetch` with `ctx.props` set). See `docs/adr/0014-...md` § "Amendment 2026-05-15" for empirical context.
- **`@aotterclam/mantle-cloudflare`**: staff MCP resource path renames from `/staff/mcp` to `/mcp/staff`. claude.ai's MCP OAuth client (verified 2026-05-15 against `cms.aotterclam.ai`) silently drops the session after a server-correct `/token` success when the resource path doesn't start with `/mcp`. `/mcp` for the public MCP endpoint is unchanged. The `/admin/api/site` response field `mcpUrl` / `staffMcpUrl` automatically reflect the new path, so admin UI copy-fields update without consumer code changes — adopter-hardcoded references (skill docs, custom routes) need to migrate.
- **`@aotterclam/mantle-cloudflare`**: OAuth `scopes_supported` collapses from `["mcp:read", "mcp:staff"]` to a single `["mcp"]` (no colon). claude.ai silently omits `scope=` from `/authorize` when `scopes_supported` contains colons, producing a zero-scope token grant the client then rejects post-token. Staff vs public differentiation moves entirely server-side: the SDK enforces admin role via D1 lookup inside `createMcpApiHandler` based on the `surface: "staff" | "public"` option, not via OAuth scope. The default scope is overridable via `createOAuthProvider({ scopesSupported })`.
- **`@aotterclam/mantle-cloudflare`**: OAuth endpoint URLs namespace under `/oauth/*` (was `/api/auth/mcp/*` via Better Auth). claude.ai web reads AS metadata (RFC 8414) so the namespace is followed correctly. Adopters who hard-coded `/api/auth/mcp/{authorize,token,register}` references in scripts or external configs need to update.
- **`@aotterclam/mantle-cloudflare`**: `Auth.getMcpSession()` removed. The OAuth lib verifies bearer tokens against its KV grant store and sets `ctx.props` before calling `apiHandler.fetch` — adopters read identity from `ctx.props.{userId, role}`, no port indirection.
- **`@aotterclam/mantle-cloudflare`**: `CreateAuthConfig.betterAuthOptions?: Partial<BetterAuthOptions>` escape hatch (added in `0.0.8-beta.4` via PR #175) is removed. With the carved-out OAuth surface the SDK no longer needs adopters to reach un-curated Better Auth internals; the remaining adopter surface (`methods[]`, `rateLimit`, `bootstrapOwner`) is fully first-class. Apple's `trustedOrigins` auto-append and `sameSite=none` cookie injection stay; only the un-curated passthrough is retracted. ADR-0014 § "Auth as contract, Better Auth as default" framing remains correct — only the §"Implementation status" reference to `betterAuthOptions` is retracted.

### Added

- **`@aotterclam/mantle-cloudflare`**: new dependency `@cloudflare/workers-oauth-provider@^0.6.0`. Top-level OAuth provider library that owns DCR + PKCE + token issue + KV grant store. The SDK exports thin helpers (`createOAuthProvider`, `createMcpApiHandler`, `mountAuthorize`) so adopters compose the worker entrypoint declaratively.
- **`@aotterclam/mantle-cloudflare`**: new SDK exports `createOAuthProvider({ defaultHandler, apiHandlers, scopesSupported? })`, `createMcpApiHandler({ ref, surface })`, `mountAuthorize({ auth, loginPath? })`, plus path constants `OAUTH_{AUTHORIZE,TOKEN,REGISTER}_PATH`.
- **landing**: new `OAUTH_KV` binding alongside the existing `KV`. Holds the OAuth provider's clients / grants / tokens; separate namespace so future cleanup can wipe it independently.

### Changed

- **docs**: ADR-0014 amended with the empirical findings (§ "Amendment 2026-05-15"). `docs/adapter-guide.md` updated for the new MCP mount pattern. `skills/provision/SKILL.md` updated to point operators at `/mcp/staff`.

## [0.0.8-beta.5] - 2026-05-14

### Breaking

- **`@aotterclam/mantle-cloudflare`**: `mountMcp` now serves the OAuth Protected Resource Metadata document at the [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) §3.1 standard URL — `/.well-known/oauth-protected-resource<resource-path>` instead of the previous (non-standard) `<resource-path>/.well-known/oauth-protected-resource`. Example: a staff MCP at `/staff/mcp` now publishes metadata at `/.well-known/oauth-protected-resource/staff/mcp`. The `WWW-Authenticate: Bearer ... resource_metadata=` hint emitted on 401 responses also points at the new URL, so MCP clients that follow the hint (Claude Code does) re-discover automatically on next call; spec-strict clients that compose the well-known URL themselves now succeed. New helper `protectedResourceMetadataPath()` is exported from the package index for downstream consumers that need to compute the URL themselves (#188).

## [0.0.8-beta.4] - 2026-05-14

### Added

- **`@aotterclam/mantle-cloudflare`**: `CreateAuthConfig` gains `betterAuthOptions?: Partial<BetterAuthOptions>` — the curated escape hatch for raw Better Auth options the SDK doesn't surface as first-class fields. Per ADR-0014 § "Auth as contract, Better Auth as default" we refuse to add `CreateAuthConfig` fields just to forward a Better Auth knob verbatim (e.g. `account.accountLinking`, `emailOTP.storeOTP`/`.resend`/`.disableSignUp`, extra plugins like `twoFactor()`, `advanced.defaultCookieAttributes`); adopters reach those via this passthrough. Merge semantics: (a) top-level keys we don't manage pass through verbatim; (b) SDK-managed top-level keys (`database`, `secret`, `baseURL`, `socialProviders`, `rateLimit`) replace adopter values wholesale; (c) `advanced` / `user` / `databaseHooks` are MERGED one level deep — SDK leaves `advanced.backgroundTasks`, `user.additionalFields.githubLogin`, and `databaseHooks.user.create.after` SDK-owned (adopter's `create.after` composes BEFORE SDK's bootstrap promotion when both are set) while letting other entries pass through (`advanced.defaultCookieAttributes`, `user.additionalFields.foo`, `databaseHooks.session.*`); (d) `plugins` are concatenated with id-dedupe so adopter dups of SDK plugin ids (`admin`, `mcp`, `email-otp`, `magic-link`) are dropped — Better Auth does NOT dedupe internally so duplicates would double-fire hooks; (e) `trustedOrigins` is array-merged (Set dedupe), and function-form `(req?) => Awaitable<string[]>` is wrapped so SDK auto-origins still ride.
- **`@aotterclam/mantle-cloudflare`**: `createAuth` auto-appends `https://appleid.apple.com` to `trustedOrigins` when a `social` method with `provider: "apple"` is registered. Apple uses `response_mode=form_post` (Apple POSTs cross-site to the callback) — Better Auth's default state cookie is `sameSite: "lax"` which does NOT ride a cross-site POST, surfacing as an opaque "state mismatch". The SDK now also auto-injects `advanced.defaultCookieAttributes: { sameSite: "none", secure: true }` whenever Apple is registered (adopter's explicit `sameSite` always wins — power users opt out by overriding). Other social providers don't currently demand auto-origins or cookie tweaks.

### Added

- **`@aotterclam/mantle-cloudflare`**: new export `appleClientSecret()` — signs the ES256 JWT Apple requires for "Sign in with Apple". Apple's `clientSecret` field is a JWT derived from team id + key id + the `.p8` private key + the Services ID audience; the helper does it in ~80 LOC against `crypto.subtle` (no `node:crypto`, no third-party JWT lib). Defaults to a 30-day JWT lifetime; rejects above Apple's 180-day cap. Adopter usage: `await appleClientSecret({ teamId, keyId, privateKey, audience })` → feed the returned string as the Apple method's `clientSecret`. Accepts both PEM-wrapped `.p8` contents and bare base64 of the DER (#172).

### Breaking

- **repo**: `engines.node` bumped from `>=20` to `>=22`. Wrangler 4 requires Node 22+ at runtime; consumers, CI workflows, and contributor machines must update. Local: `nvm install 22 && nvm use 22`. CI step `actions/setup-node@v4` now sets `node-version: 22` (#170).
- **`@aotterclam/mantle-cloudflare`**: dev dependency `wrangler` bumped from `^3.103.2` to `^4.0.0`, and peer-aligned `@cloudflare/workers-types` from `^4.20251101.0` to `^4.20260508.1`. Adopter starter projects deploying via the Cloudflare adapter inherit the Node 22 floor. Motivation: Cloudflare surfaces an explicit out-of-date warning for wrangler 3 on every deploy, and known v3 dev-server cleanup bugs (orphan `workerd` holding the local port across Ctrl+C / terminal close) won't be back-ported (#170).
- **`@aotterclam/mantle-cloudflare`**: `AuthMethodConfig` collapses the `kind: "github"` case into the new generic `kind: "social"` discriminated by `provider`. Mirrors Better Auth's own `socialProviders` block shape and unlocks ~35 upstream IDPs (`google`, `apple`, `microsoft-entra-id`, `facebook`, `discord`, `twitter`, `linkedin`, `spotify`, `twitch`, `gitlab`, `tiktok`, `reddit`, `kick`, `vk`, `naver`, `kakao`, `line`, `slack`, `atlassian`, `zoom`, `notion`, `figma`, `linear`, `vercel`, `paypal`, `huggingface`, `cognito`, `salesforce`, `polar`, `railway`, `roblox`, `paybin`, `wechat`, `dropbox`, plus `github`). Adopter migration: `{ kind: "github", clientId, clientSecret }` → `{ kind: "social", provider: "github", clientId, clientSecret }`. `bootstrapOwner: { match: "github-login" }` continues to work; the internal `mapProfileToUser` shim still populates `user.githubLogin` when `provider === "github"`. Provider-specific fields (Apple's `teamId` / `keyId` / `privateKey`, Microsoft Entra ID's `tenantId`, etc.) ride via the new `extras?: Record<string, unknown>` field merged verbatim into Better Auth's per-provider config (#166).
- **`@aotterclam/mantle-cloudflare`**: `Auth.methods` now returns structured `AuthMethodInfo[]` objects instead of `AuthMethodKind[]` strings — `{ kind: "email-otp" } | { kind: "magic-link" } | { kind: "social"; provider }`. The `GET /api/auth/methods` endpoint reflects the new shape so the admin SPA can dispatch per-provider (#166).

### Added

- **`@aotterclam/mantle-runtime`**: new optional port `EmailSender` (`domain/port/EmailSender.ts`). Transactional-email contract for features that need to send mail — passwordless sign-in, order receipts, etc. The SDK never owns email body templates; the port hands the sender a `locale` (BCP 47) so adopter-supplied senders branch on language without the runtime owning translation tables (#158).
- **`@aotterclam/mantle-cloudflare`**: new `AuthMethodConfig` union case `{ kind: "email-otp", sender, otpLength?, expiresInSeconds?, allowedAttempts?, fallbackLocale? }`. Better Auth's `emailOTP` plugin wires in; locale resolves from request `Accept-Language` falling back to `fallbackLocale`. Plays alongside `github` via the `methods[]` array — adopters mix-and-match. Per ADR-0014 (#158).
- **`@aotterclam/mantle-cloudflare`**: new `ConsoleEmailSender` dev impl — logs the email body instead of sending. Convenience for `wrangler dev`; not for production wiring (#158).
- **`@aotterclam/mantle-cloudflare`**: new endpoint `GET /api/auth/methods` returning `{ methods: AuthMethodKind[] }` for the registered sign-in methods. Secrets and sender refs are intentionally excluded — the admin SPA reads this to render per-method UI sections without baking the method list into its build (#159).
- **`@aotterclam/mantle-cloudflare`**: `Auth.methods` field on the returned `Auth` interface — the in-order list of method kinds. Adapters / mount code can introspect what's wired (#159).
- **`@aotterclam/mantle-admin-ui`**: SignInView is now data-driven — fetches `/api/auth/methods` on mount and renders one section per registered method. When `email-otp` is registered, a two-step inline form (email → 6-digit code). When `github` is registered, the existing social button. Multiple methods stack with separators. Adding a new method (passkey, google) becomes a new section + new i18n keys, not new SignInView code (#159).
- **`@aotterclam/mantle-admin-ui`**: i18n key family `auth.signIn.method.<kind>.*` for per-method labels + body text + error states. EN canonical; zh-TW and ja carry translations for the email-OTP UI; other languages fall back to EN per the documented chain (#159).
- **`@aotterclam/mantle-cloudflare`**: new `AuthMethodConfig` union case `{ kind: "magic-link", sender, expiresInSeconds?, allowedAttempts?, fallbackLocale? }`. Better Auth's `magicLink` plugin wires in; `sendMagicLink` dispatches the click-URL through the configured `EmailSender` with category `auth.magic-link.sign-in`. Singleton-per-config like `email-otp`. Rate-limit default now fires when either `email-otp` OR `magic-link` is registered (#164).
- **`@aotterclam/mantle-admin-ui`**: `MagicLinkSection` added to SignInView — single email field → "check your inbox" confirmation state. POSTs to `/api/auth/sign-in/magic-link` with `callbackURL: returnTo` so the email link lands on the original destination after verification. New `auth.signIn.method.magic-link.*` i18n keys; EN/zh-TW/ja translated (#164).
- **`@aotterclam/mantle-admin-ui`**: generic `SocialSignInSection` replaces the GitHub-only button. Renders one button per registered social method, label templated from `auth.signIn.method.social.button` ("Continue with {provider}") with a brand display-name table (`SOCIAL_PROVIDER_DISPLAY_NAME`) so e.g. `microsoft-entra-id` → "Microsoft", `huggingface` → "Hugging Face". Brand names aren't translated; only the "Continue with" wrapper is, in EN/zh-TW/ja (#166).

### Changed

- **`@aotterclam/mantle-admin-ui`**: `auth.signIn.body` reworded from GitHub-specific framing ("GitHub OAuth keeps this console limited to your staff list.") to method-neutral ("Staff console. Access is gated by role after sign-in."). EN canonical updated; zh-TW + ja translations added; remaining languages fall back to EN per the documented chain (#159).

### Breaking

- **`@aotterclam/mantle-cloudflare`**: `CreateAuthConfig` reshaped. `github?: {…}` + `adminGithubLogin?: string` removed; replaced with `methods: AuthMethodConfig[]` (discriminated union, currently `{ kind: "github", … }`) + `bootstrapOwner?: BootstrapOwnerRule` (`{ match: "github-login" | "email", value: string }`) + optional `rateLimit: { window, max }` passthrough to Better Auth's built-in. Boot fast-fails on empty `methods`; constructor cross-checks that `bootstrapOwner: { match: "github-login" }` has a matching `github` method registered. Substrate for upcoming email-OTP / magic-link / Google methods per ADR-0014. Adopters: wrap GitHub config as `methods: [{ kind: "github", clientId, clientSecret }]` and move `adminGithubLogin` to `bootstrapOwner: { match: "github-login", value: ADMIN_GITHUB_LOGIN }` (#157).

## [0.0.8-beta.1] - 2026-05-13

First beta on the road to v0.1.0. Channel moves from `alpha` to `beta` — packages now ship under the `beta` dist-tag. All `0.0.x-alpha` versions are superseded by this release and have been deprecated on npm.

### Added

- Runtime parent-join across all four render paths (live entry / live list / preview / publish-time KV pipeline). Implements ADR-0010's declared "render path joins translation to parent on slug" behavior, which had been deferred since the rebuild — templates that expect parent-level fields (`posts.coverUrl`, `posts.authorId`, `posts.publishedAt`) on `entry.data` now see them on a child `post-translations` row without manual denormalization. New `JoinedEntryReader.joinParentIfTranslation` (single) + `joinParentForList` (batched with `IN (?, ...)` + dedup to avoid N+1) (#145).
- Install Skill workflow gate under Auto Mode clause 4 — reframes `npx create-clam-cms` invocation as a destructive action under the harness's own carve-out, so per-parameter user authorization survives the auto-mode "minimize interruptions" reminder. Replaces the prior ASK-override that triggered echo-conflict (#145).
- Picker-style archetype probes — `publication/SKILL.md` (and the install Skill's multi-round purpose discovery stance) converted from open-ended questions to 5 multiple-choice probes, leading with "what's this publication for" (clam-cms-starters #31).
- Audience-explicit interview — locale choice now derives from a user-stated audience scope (domestic / which country / international), not inferred from the user's writing language.

### Changed

- `publication/src/clamConfig.ts`: `brand` / `title` / `description` now use `{{BRAND}}` / `{{DESCRIPTION}}` placeholder macros instead of literal `"Clam Publication"` fallbacks. Real installs no longer seed D1 `site_config` with the literal default (clam-cms-starters #31).
- Install Skill cover-image source switched from the deprecated `source.unsplash.com` (2023 end-of-life, returning 503) to LoremFlickr; verification uses GET (not HEAD — Cloudflare-fronted image services reject HEAD with 405) (#145).
- `publication` / `presence` / `intake` Header components hide the language popover when `localesAvailable.length <= 1` — monolingual sites no longer render a single-item dropdown.
- `docs/release-process.md` clarifies that `@aotterclam/create-clam-cms` is intentionally not published to npm; consumers invoke it via `npx <github-release-tarball-url>` (#146).
- `CLAUDE.md` "Where things live" table now surfaces `docs/release-process.md`, `CONTRIBUTING.md`, `CHANGELOG.md`; README adds quick-links so release / contribution docs are discoverable from the repo entry points (#146).

### Removed

- zh-TW illustrative blocks across install Skill, publication archetype hint, and editor first-prompt template. Skill bodies are EN-only; the agent renders output in the user's language at native register. Reverses a regression from earlier alpha cycles where translation examples leaked back in.

## [0.0.8-alpha] - 2026-05-12

### Added

- ADR-0016 site semantic layer: `AGENTS.md` (cross-tool entry) + `mantle/site.md` (Mantle's frontmatter + section bodies), filled from `{{PLACEHOLDER}}` templates and updated atomically (#107).
- `@aotterclam/create-clam-cms` npx scaffolder: fetches the starters monorepo tarball, merges `_common/` + `<archetype>/`, substitutes ADR-0016 placeholders, prints RUN_NOTES JSON. Replaces the manual `curl … | tar -xzf` + `setup:site` ritual (#109).
- 8 archetype briefs under `skills/install/archetypes/` — 4 ready/extension (`presence`, `publication`, `intake`, `blank`) + 4 roadmap-refuse (`transaction`, `reservation`, `community`, `membership`) (#110).

### Changed

- `skills/install/SKILL.md` rewritten as a Mantle-persona interview brief (~140 lines, down from 396); no more `clam_cms_request:` YAML block — Mantle gathers `brand` / `locales` / GitHub identity by conversation (#110).
- `skills/provision/SKILL.md` realigned to Mantle voice on user-facing strings; updates `mantle/site.md` `site_url:` + `revisions:` after deploy per ADR-0016. Stale `--seed-file` / `seed:initial` references removed (#111).
- `docs/prompts/` collapsed to single-sentence two-URL format; SKILL_INSTALL_URL + SKILL_ARCHETYPE_URL replace the YAML block (#110).
- CLAUDE.md table points at the starters monorepo `AotterClam/clam-cms-starters` (admin rename of `clam-cms-starter-publication` is pending; auto-redirect keeps the old URL working).

### Removed

- `starters/blank/` migrated out of this SDK monorepo into `AotterClam/clam-cms-starters/blank/`. SDK keeps a stub README pointing outward, same engineering forcing function as `packages/adapters/netlify/` (#108).
- `pnpm-workspace.yaml` no longer includes `starters/*`; root `check:starters` script removed.

## [0.0.7-alpha] - 2026-05-10

### Added

- Contributor governance docs: contributing guide, issue templates, PR template, label guide, release process, security policy, and code of conduct.
- Website archetype ADR for the official-site selector (`presence`, `publication`, `intake`, `transaction`, `reservation`, `community`, `membership`).
- R2-backed media upload lifecycle: create upload, direct PUT, commit, and MCP/admin endpoints.
- Better Auth-backed admin and MCP OAuth/DCR wiring with dual `/staff/mcp` and `/mcp` surfaces.
- Deferred lifecycle after-hook delivery via an optional adapter dispatcher and Cloudflare Workers Queue implementation.

### Changed

- Publication starter replaces the older blog naming and carries the v0.1 agent-provisioned site path.
- Runtime authoring paths now share entry validation for schema `pattern`, `format`, locale membership, unique indexes, and translates parent checks.
- Provision/install docs and Skills now target `0.0.7-alpha`.

## [0.0.6-alpha] - 2026-05-08

### Added

- Alpha rebuild packages and starters for the v0.1.0 development line.

[Unreleased]: https://github.com/AotterClam/clam-cms/compare/v0.0.8-alpha...HEAD
[0.0.8-alpha]: https://github.com/AotterClam/clam-cms/compare/v0.0.7-alpha...v0.0.8-alpha
[0.0.7-alpha]: https://github.com/AotterClam/clam-cms/compare/v0.0.6-alpha...v0.0.7-alpha
[0.0.6-alpha]: https://github.com/AotterClam/clam-cms/releases/tag/v0.0.6-alpha
