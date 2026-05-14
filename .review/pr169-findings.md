# PR #169 review — `test/issue-168-create-auth-unit-tests`

35 unit tests added for `createAuth.ts`; 4 helpers exported with `@internal` JSDoc. `pnpm typecheck` clean; `pnpm test` reports 79/79 passed but **exits non-zero** (H1).

## Findings

### H1 — Test run exits non-zero due to leaked BetterAuth rejection
Vitest prints `Tests 79 passed (79)` then `2 unhandled errors: BetterAuthError: Failed to initialize database adapter`; pnpm exits 1. Origin: `better-auth/.../adapter-kysely.mjs` lazily calls `createKyselyAdapter(opts)`, the fake D1 has no kysely-compatible surface, the lazy promise rejects after `createAuth` returns. The two `boot invariants` happy-path tests trigger it.
**Fix:** flesh `fakeDb()` with the kysely probe response, OR install a vitest `unhandledRejection` filter for `BetterAuthError`. Shipping a suite that fails CI on green tests is worse than no suite.

### H2 — `@internal` JSDoc is decorative; helpers land in the public `.d.ts`
`tsconfig.base.json` and `tsconfig.lib.json` do not set `stripInternal`. After rebuild, `dist/auth/createAuth.d.ts` lines 127-150 emit `export declare function buildSocialProviders / pickLocale / validateBootstrap / shouldPromoteToOwner` — fully public, IDE-autocompletable. The "exporting helpers for tests is fine when marked clearly" premise is not enforced.
**Fix:** add `"stripInternal": true` to `tsconfig.lib.json` only (tests still need the runtime imports). Confirm the rebuilt .d.ts no longer lists the four helpers.

### M1 — `extras` vs `githubProfileMapper` spread order not asserted
Line 233-240 builds github as `{ …, ...extras, ...githubProfileMapper }`. Order is load-bearing (defence-in-depth against a hypothetical extras-shadow even with reserved-keys passing). No test asserts the shim survives when `extras` is present.
**Fix:** add a test that builds github with `extras: { prompt: "consent" }` and asserts `out.github.mapProfileToUser` is still the shim function.

### M2 — `scope: [...method.scope]` defensive copy not verified
Line 237 spreads `scope` into a fresh array to prevent adopter mutation leaking into BetterAuth config. The existing test only deep-equals.
**Fix:** one-liner — `const scope = ["openid"]; …; expect(out.google.scope).not.toBe(scope);`.

### M3 — `rateLimit` email-method-default behaviour untested
Lines 406-412 enable `{window:60, max:10}` whenever `email-otp` or `magic-link` is registered (Workers `NODE_ENV` is unset → BetterAuth would silently skip). No test inspects the constructed instance for this. The helper isn't exported.
**Fix:** extract `resolveRateLimit(methods, override)` as `@internal` pure helper and test the four cases (no email / email-only / override-only / both).

### M4 — `advanced.backgroundTasks.handler` registration untested
The fire-and-forget handler (441-450) is the PR #161 timing-leak fix. No test verifies presence. Same reachability problem as M3.
**Fix:** acceptable to defer to integration smoke, but note explicitly in the test preamble so the next reviewer doesn't assume coverage.

### M5 — `buildEmailOTPPlugin` / `buildMagicLinkPlugin` untested
Neither is exported; both carry real logic — `pickLocale` wiring, defaults (`MAGIC_LINK_DEFAULT_*=900/3`), the synchronous-return contract (#161 oracle fix), category strings (`auth.email-otp.${data.type}`).
**Fix:** export both with `@internal` (after stripInternal lands per H2), add 4-6 tests covering defaults, overrides, locale wiring, category formatting.

### L1 — Error-regex coupling
Messages are part of the vibe-coder contract; fragility is the acceptable tradeoff. Error codes would decouple but that's v0.2. **No action.**

### L2 — `it.each` reserved-key regex precision
`reserved key.*${reserved}` is unambiguous — all five reserved keys are distinct substrings and the `reserved key.*` prefix anchors them. **No action.**

### L3 — Type-narrowing smoke tests
The two `if (method.kind === "social")` blocks are compile-time tripwires. They'd surface as `tsc` errors if the union widened. Useful as-is. **No action.**

### L4 — `baseConfig()` github-social default
Convenient defaults but the "github-login bootstrap with no github method" test had to explicitly override `methods`. No hidden case found.
**Fix:** add a comment on `baseConfig` flagging the github inheritance so future authors don't trip on it.

### L5 — Tests-as-documentation
A vibe-coder learns boot invariants and helper contracts, not how to wire `Auth.handler` into a Hono mount or what `getMcpSession` returns. Preamble correctly defers that to integration. **No action.**

## Ship recommendation

**Request changes.** H1 must land here — a suite failing CI on green tests is a regression. H2 same-PR because `@internal` discipline is the stated contract and the current shape silently promotes four helpers to public API. M1, M2 are 3-line additions worth doing now. M3-M5 reasonable follow-ups; flag in PR body. Once H1 + H2 + M1 + M2 land, approved.
