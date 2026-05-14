# PR #160 — code review findings

Scope: pure shape refactor of `CreateAuthConfig`. Correctness + breaking-change handling + design holes. Hygiene file — delete before merge.

Baseline: `pnpm --filter @aotterclam/clam-cms-cloudflare typecheck` clean; `vitest run` 7 files / 44 tests pass.

---

## [BLOCKING]

Nothing material.

## [MAJOR]

### M1 — `shouldPromoteToOwner` accepts incompatible rule / method pairings

Adopter can write `bootstrapOwner: { match: "github-login", value: "..." }` alongside `methods: [{ kind: "email-otp", ... }]` (post PR-B). Promotion silently never fires because `user.githubLogin` is null on email sign-ins. OLD code couldn't reach this state — only GitHub was wired. The inverse (`match: "email"` + github-only methods) coincidentally works because Better Auth copies the GitHub profile email onto `user.email`, so the asymmetry is real and surprising.

- **Why this matters**: silent first-staff-promotion no-op is the highest-cost misconfig — the adopter sees a working sign-in, can't promote, blames the SDK. Hits CLAUDE.md's "vibe-coders won't read source" failure mode.
- **Suggested fix**: validate `bootstrapOwner.match` against `methods[]` in `buildAuth`, throw with the conflicting pair named. Acceptable to defer to PR-B if tracked — the validation is dead-letter today since only github exists. Note the deferral in the PR body.

## [MINOR]

### m1 — ADR-0011 example uses old shape

`docs/adr/0011-adapter-port-spec.md:147-165` still shows `github: {...}, adminGithubLogin: env.ADMIN_GITHUB_LOGIN`. Agents reading the ADR will write code that no longer compiles.

- **Suggested fix**: update the example block in this PR, or carve out a follow-up; tracking it is the requirement.

### m2 — CHANGELOG `[Unreleased]` has no entry for the breaking change

CLAUDE.md release discipline + project policy: breaking change in v0.1.x is fine, but should land in CHANGELOG.

- **Suggested fix**: under `[Unreleased]` → `### Changed (BREAKING)`: `createAuth: github / adminGithubLogin replaced by methods[] + bootstrapOwner (#160). See PR for migration.`

### m3 — `AuthMethodConfig` is a "union" of one; `for ... if` swallows unknown kinds

The type is `{ kind: "github"; ... }` — fine today, but `buildSocialProviders` falls through silently on unknown kinds. Once PR-B adds the second member, a typo'd kind (`"email_otp"`) becomes a no-op; the empty-methods throw won't fire because `methods.length > 0`.

- **Suggested fix**: convert `if (method.kind === "github")` to `switch (method.kind) { case "github": ...; default: const _: never = method.kind; }` so PR-B inherits exhaustiveness.

### m4 — `shouldPromoteToOwner` recomputes normalized `target` on every user-create

The simplifier pass (commit 4068667) lifted `const target = rule.value.trim().toLowerCase()` once per call — better than the inline duplication, but still per call. OLD code did `config.adminGithubLogin?.trim()` once at construction. Functionally equivalent; the construction-time normalize is also the natural seam for the M1 validation gate.

- **Suggested fix**: normalize `bootstrapOwner.value` once in `buildAuth` alongside the M1 gate; pass the pre-normalized rule into `shouldPromoteToOwner`.

## [NIT]

### n1 — Empty `methods[]` throw timing

Fires at `buildAuth` → invoked synchronously by `createAuth(config)`, so it's construction-time, not request-time. Good. Message is friendly. Once PR-C lands, consider linking to a starter example.

### n2 — `rateLimit` shape verified against `better-auth@1.6.9`

`{ ...config.rateLimit, enabled: true }` resolves to `BetterAuthRateLimitOptions = Optional<{window, max}> & ... & { enabled?: boolean }`. Spread is bit-correct; the conditional spread `...(config.rateLimit ? {...} : {})` is a clean no-op when undefined. Nothing to fix.

### n3 — github-only path is bit-identical

`buildSocialProviders` produces the same `socialProviders.github` object as the OLD inline construction (clientId, clientSecret, mapProfileToUser, optional redirectURI). Behaviour parity confirmed.

## [QUESTION]

### q1 — `createAuth` itself has no tests

The cloudflare suite imports the `Auth` type in two places but never constructs `createAuth(...)` and never exercises the bootstrap hook. OLD code had the same gap — this PR doesn't regress. With PR-B about to triple the surface area, a `createAuth.test.ts` covering (a) empty-methods throw, (b) github socialProviders shape, (c) `shouldPromoteToOwner` matrix (`github-login` × {match, mismatch, null} + `email` × same) would pay for itself before PR-B. Suggest exporting `shouldPromoteToOwner` (or relocating to a pure sibling) so tests don't need a Better Auth instance. Not blocking PR-A.

### q2 — Env-var rename (out of scope, flag only)

`skills/provision/SKILL.md` mentions `ADMIN_GITHUB_LOGIN` ~6 times. This PR keeps the env-var contract; only the SDK config shape changed. Future rename to `BOOTSTRAP_OWNER_*` would be its own PR + CHANGELOG entry.

## Ship recommendation

**Approve with M1 + m2 addressed before merge.** M1 (bootstrap-rule / method compatibility) is the only design hole — it becomes an adopter trap once PR-B exists; either fix here or file a tracking issue and call it out in the PR body. m2 (CHANGELOG) is policy. m1, m3, m4 are good follow-ups. Github-only path is bit-identical, `rateLimit` shape is correct, typecheck + tests stay green.
