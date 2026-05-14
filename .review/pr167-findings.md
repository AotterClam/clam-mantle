# PR #167 — code review findings

Branch: `feat/issue-166-social-providers-aligned` (head `2654dc1`, includes the post-PR simplification pass)
Scope: collapse `kind:"github"` into generic `kind:"social"` discriminated by `provider`; add `extras` escape hatch; structured `AuthMethodInfo[]` exposed via `Auth.methods` and `GET /api/auth/methods`.

Baseline: `pnpm typecheck` (cloudflare + admin-ui) and `pnpm --filter @aotter/mantle-cloudflare test` (44/44) green at this head.

---

## Findings

### F1 — `extras` silently overrides `clientId` / `clientSecret` — HIGH
Spread order in `buildSocialProviders` is `{ clientId, clientSecret, …redirectURI, …scope, …extras, …githubProfileMapper }`. `extras: { clientSecret: "…" }` wins, replacing the typed field — credential-shape footgun, exactly the vibe-coder failure mode CLAUDE.md says the runtime should absorb.
**Fix:** before spreading `extras`, throw on reserved keys (`clientId`, `clientSecret`, `redirectURI`, `scope`; for github also `mapProfileToUser`). Message: "extras must not redeclare typed first-class fields."

### F2 — `extras` JSDoc Apple example is wrong — MEDIUM
The cast `out as BetterAuthOptions["socialProviders"]` hides required-field gaps. In Better Auth 1.6.9 `AppleOptions extends ProviderOptions` only requires `clientId` — there is no `teamId`/`keyId`/`privateKey` in the typed shape; Apple expects `clientSecret` to already be a pre-baked JWT. The PR docstring lists those three fields as Apple's `extras` use case, which will mislead an LLM agent reading the type. Microsoft's `tenantId?` and Reddit's `duration?` are real (verified in `*.d.mts`); Apple's trio is not.
**Fix:** drop the Apple example from the `extras` JSDoc, replace with Microsoft `tenantId` + Reddit `duration`.

### F3 — `scope: string[]` uniform across providers — VERIFIED OK
`ProviderOptions.scope?: string[]` is on the shared base (`oauth-provider.d.mts:97`); Apple, Google, Microsoft Entra ID, GitHub all inherit unchanged. No per-provider shape divergence in 1.6.9.

### F4 — GitHub `mapProfileToUser` shim wins over `extras` — INTENTIONAL but UNDOCUMENTED — LOW
After `2654dc1` the `githubProfileMapper` spread is last, so adopter cannot override the github-login shim via `extras.mapProfileToUser`. For non-github providers `extras.mapProfileToUser` lands intact. The asymmetry is correct (it guards `bootstrapOwner.match:"github-login"`) but invisible.
**Fix:** one-line comment "intentionally wins over extras — guards the bootstrap invariant." If F1 lands, fold `mapProfileToUser` into the github-case reserved-key list so adopters get an explicit error.

### F5 — `SocialProviderId` curation freshness — MAINTENANCE
35 ids hardcoded; matches Better Auth 1.6.9's `dist/social-providers/*.d.mts` exactly. Failure mode if Better Auth ships a 36th: adopter gets a clean TS error. Not a runtime hazard.
**Fix:** comment "synced to Better Auth 1.6.9 — bump together" near the union. Non-blocking.

### F6 — `/api/auth/methods` shape break — ACCEPTABLE
Old cached SPA bundles crash on `data.methods[i].kind`. Admin-ui ships pre-built `dist/` workspace-locked to the adapter; v0.1.x explicitly accepts breaking changes. CHANGELOG entry already calls it out. No action.

### F7 — `scope` defensive copy — VERIFIED OK
`[...method.scope]` prevents Better Auth observing the adopter's `ReadonlyArray`. Cheap; keep.

### F8 — `SOCIAL_PROVIDER_DISPLAY_NAME` brand audit — LOW
`microsoft-entra-id → "Microsoft"` matches Microsoft's "Sign in with Microsoft" guidance. `twitter → "Twitter / X"` is defensible transitional. `huggingface → "Hugging Face"`, `line → "LINE"`, `vk → "VK"` all correct. No action; consider externalising to JSON if community edits ever matter.

### F9 — `bootstrapOwner.match:"github-login"` silent-no-op with mixed socials — MEDIUM
A site registering both `provider:"github"` and `provider:"google"` with `match:"github-login"` silently fails to promote the first Google signup. `validateBootstrap` only confirms a github method exists, not that the first signup will route through it.
**Fix:** tighten the JSDoc on `BootstrapOwnerRule` (or emit a boot warning): "with multiple social methods registered, `match:'github-login'` only fires when the first signup is via GitHub; prefer `match:'email'` for mixed-provider sites." Non-blocking.

### F10 — Test gaps (top 3 for follow-up smoke harness)
1. **`extras` reserved-key guard** (once F1 lands) — `buildSocialProviders` unit: extras cannot override `clientId`/`clientSecret`; non-github `extras.mapProfileToUser` preserved; github case overridden by shim.
2. **`validateBootstrap` cross-product** — `match:"github-login"` with only `provider:"google"` registered must throw (currently only the no-social case is covered).
3. **`Auth.methods` shape contract** — snapshot of structured output `[{kind:"social",provider:"github"}, {kind:"email-otp"}, {kind:"magic-link"}]` to regression-pin the SPA contract.

---

## Ship recommendation

**Ship after F1 is fixed.** The `extras` credential-shadow is the only finding that crosses the "vibe-coder safety" threshold CLAUDE.md draws — it converts a wrong manifest into silently-misconfigured OAuth instead of a structured diagnostic. Fix is ~6 lines + one message and slots cleanly into `buildSocialProviders`; F2's JSDoc correction rides along. F4/F5/F8/F9 are documentation / maintenance flags safe as follow-up issues; F3/F6/F7 verified non-issues. Typecheck + cloudflare tests pass; the structural collapse is sound and 35 providers landing for the cost of one union case is exactly the boundary alignment the PR claims.
