# Changelog

All notable changes to clam-cms are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic versioning once public v0.1.0 tags begin. Pre-v0.1.0 alpha releases may still change public APIs.

## [Unreleased]

### Added

- **`@aotterclam/clam-cms-runtime`**: new optional port `EmailSender` (`domain/port/EmailSender.ts`). Transactional-email contract for features that need to send mail — passwordless sign-in, order receipts, etc. The SDK never owns email body templates; the port hands the sender a `locale` (BCP 47) so adopter-supplied senders branch on language without the runtime owning translation tables (#158).
- **`@aotterclam/clam-cms-cloudflare`**: new `AuthMethodConfig` union case `{ kind: "email-otp", sender, otpLength?, expiresInSeconds?, allowedAttempts?, fallbackLocale? }`. Better Auth's `emailOTP` plugin wires in; locale resolves from request `Accept-Language` falling back to `fallbackLocale`. Plays alongside `github` via the `methods[]` array — adopters mix-and-match. Per ADR-0014 (#158).
- **`@aotterclam/clam-cms-cloudflare`**: new `ConsoleEmailSender` dev impl — logs the email body instead of sending. Convenience for `wrangler dev`; not for production wiring (#158).
- **`@aotterclam/clam-cms-cloudflare`**: new endpoint `GET /api/auth/methods` returning `{ methods: AuthMethodKind[] }` for the registered sign-in methods. Secrets and sender refs are intentionally excluded — the admin SPA reads this to render per-method UI sections without baking the method list into its build (#159).
- **`@aotterclam/clam-cms-cloudflare`**: `Auth.methods` field on the returned `Auth` interface — the in-order list of method kinds. Adapters / mount code can introspect what's wired (#159).
- **`@aotterclam/clam-cms-admin-ui`**: SignInView is now data-driven — fetches `/api/auth/methods` on mount and renders one section per registered method. When `email-otp` is registered, a two-step inline form (email → 6-digit code). When `github` is registered, the existing social button. Multiple methods stack with separators. Adding a new method (passkey, google) becomes a new section + new i18n keys, not new SignInView code (#159).
- **`@aotterclam/clam-cms-admin-ui`**: i18n key family `auth.signIn.method.<kind>.*` for per-method labels + body text + error states. EN canonical; zh-TW and ja carry translations for the email-OTP UI; other languages fall back to EN per the documented chain (#159).
- **`@aotterclam/clam-cms-cloudflare`**: new `AuthMethodConfig` union case `{ kind: "magic-link", sender, expiresInSeconds?, allowedAttempts?, fallbackLocale? }`. Better Auth's `magicLink` plugin wires in; `sendMagicLink` dispatches the click-URL through the configured `EmailSender` with category `auth.magic-link.sign-in`. Singleton-per-config like `email-otp`. Rate-limit default now fires when either `email-otp` OR `magic-link` is registered (#164).
- **`@aotterclam/clam-cms-admin-ui`**: `MagicLinkSection` added to SignInView — single email field → "check your inbox" confirmation state. POSTs to `/api/auth/sign-in/magic-link` with `callbackURL: returnTo` so the email link lands on the original destination after verification. New `auth.signIn.method.magic-link.*` i18n keys; EN/zh-TW/ja translated (#164).

### Changed

- **`@aotterclam/clam-cms-admin-ui`**: `auth.signIn.body` reworded from GitHub-specific framing ("GitHub OAuth keeps this console limited to your staff list.") to method-neutral ("Staff console. Access is gated by role after sign-in."). EN canonical updated; zh-TW + ja translations added; remaining languages fall back to EN per the documented chain (#159).

### Breaking

- **`@aotterclam/clam-cms-cloudflare`**: `CreateAuthConfig` reshaped. `github?: {…}` + `adminGithubLogin?: string` removed; replaced with `methods: AuthMethodConfig[]` (discriminated union, currently `{ kind: "github", … }`) + `bootstrapOwner?: BootstrapOwnerRule` (`{ match: "github-login" | "email", value: string }`) + optional `rateLimit: { window, max }` passthrough to Better Auth's built-in. Boot fast-fails on empty `methods`; constructor cross-checks that `bootstrapOwner: { match: "github-login" }` has a matching `github` method registered. Substrate for upcoming email-OTP / magic-link / Google methods per ADR-0014. Adopters: wrap GitHub config as `methods: [{ kind: "github", clientId, clientSecret }]` and move `adminGithubLogin` to `bootstrapOwner: { match: "github-login", value: ADMIN_GITHUB_LOGIN }` (#157).

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
