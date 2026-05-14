# PR #174 review — `docs/auth-as-contract-better-auth-default`

Docs-only. Three files touched (ADR-0014 +60, CONTRIBUTING.md +1, README.md +/-3).
Scope was to (a) codify `Auth = contract / createAuth = default impl`, (b) gate
future Better Auth pass-through PRs in CONTRIBUTING, (c) soft-frame in README.

## Findings

### [MAJOR] Cascade PR count is wrong (twice over)
ADR §7 line 145 says "five auth-cascade PRs (#160 → #173)". Actual merges on
`develop` between #160 and #173: **#160, #161, #162, #165, #167, #169, #173 = 7
PRs**. The "→" notation also reads as a range when the cascade is discrete; if
the author wants a range, "#160–#173" is more honest, but the count is the
load-bearing claim. **Fix:** "The seven auth-cascade PRs (#160, #161, #162,
#165, #167, #169, #173) shipped …".

### [MAJOR] "Anti-pattern to refuse" criteria leak via #3 ("opinionated default")
Five of the six criteria name a concrete artifact (Workers-aware default with
example; cross-adapter port; safety net; new abstraction; DX helper that removes
a Workers-hostile dep). Criterion #3 — *"It opinionates a default we'd bet on
(e.g. magic-link 15min TTL / 3 attempts for mail prefetchers)"* — is a fully
general escape: any pass-through PR can claim "we changed the default from
Better Auth's X to Y". The very PRs the maintainer pulled the brake on
(`account.accountLinking.trustedProviders`, `emailOTP.disableSignUp`) can each
re-enter under "we set a different default than Better Auth ships". **Fix:** add
one binding word — e.g. *"opinionates a default the SDK is willing to **defend
across adopters** (e.g. magic-link 15min TTL …)"* — and add the inverse rule
explicitly: "renaming a Better Auth field with a different literal default is
still pass-through; the test is whether the SDK would refuse the Better Auth
default upstream."

### [MAJOR] CONTRIBUTING gate has the same leak + a "slight default tweak" hole
Line 114 ends "New first-class fields on `CreateAuthConfig` need to encode a
Workers-aware default, a cross-adapter port, an opinionated default the SDK is
willing to bet on, a safety net, or a new abstraction." Same #3 escape hatch
applies; "willing to bet on" is softer than the ADR's bar. **Fix:** mirror the
tightened ADR wording, and append "a new literal default value for an existing
Better Auth field does not, by itself, justify a new `CreateAuthConfig` field —
use `betterAuthOptions`."

### [MINOR] `betterAuthOptions` forward reference is ambiguous
ADR §7 says "the escape hatch is the answer: `CreateAuthConfig.betterAuthOptions
?: Partial<BetterAuthOptions>` **(introduced alongside this amendment)**". The
companion is PR-H2, not landed yet. "Alongside" reads "in this same PR" to a
fresh reader. CONTRIBUTING refers to it as already extant. **Fix:** "(landing in
the companion PR-H2 / issue-N)" — or, if PR-H2 merges first, drop the
parenthetical entirely.

### [MINOR] URL-convention claim — verified, but understated
ADR §7: "only the `/api/auth/*` URL convention … is a second-tier contract that
affects the admin SPA's hard-coded `fetch()` paths." Confirmed in
`packages/mantle-admin-ui/src/features/auth/auth-views.tsx`: SIX hard-coded
endpoints — `/api/auth/methods`, `/sign-in/social`, `/email-otp/send-
verification-otp`, `/sign-in/email-otp`, `/sign-in/magic-link`, `/sign-out`
(plus the `methods` payload shape). "Replacing the backend means matching that
URL convention OR forking the admin SPA's `auth-views.tsx`" is true but
under-sells the coupling. **Fix:** add "(six endpoints + the `Auth.methods`
payload shape)" so a future agent doesn't think it's only `/methods`.

### [MINOR] README "30+ social providers" undercounts
README line 49 says "30+ social providers". `SocialProviderId` in
`createAuth.ts` lines 18–53 enumerates **35**. "30+" is technically true; "35"
is the actual number the cascade shipped. Marketing-acceptable as-is; the task
prompt flagged it. **Fix (optional):** "35 social providers" reads cleaner and
matches the union.

### [NIT] "Five-PR cascade" vs "seven" — same drift in commit message
`bbe0030` commit body likely echoes the five-PR framing. If amended for the
count fix, sync the commit message too. (Not blocking; will be deleted with the
file before merge per the prompt.)

### [NIT] §7 ordering — the contract sentence and the file pointer split
The two bold lines "The SDK's public auth contract is the `Auth` interface, not
Better Auth." and `packages/adapters/cloudflare/src/auth/createAuth.ts exports`
are 4 lines apart with the type definition between them. Reads fine but a
future agent grep-searching for "the contract is `Auth`" lands on the bold line
without the file path. Tolerable.

### [QUESTION] §8 "deferred package split" still says "Auth interface lives in the adapter"
Line 186 — "Auth interface lives in the adapter (could move to runtime…)". The
amendment elevates `Auth` to a public contract; should it move to runtime now
that we're naming it the SDK contract? Not blocking this PR — this is the
in-place co-location call from §8. Worth surfacing on the H2 follow-up.

### [Tone] Consistent
Terse, names file paths (`createAuth.ts`, `mountServerEndpoints`, etc.), keeps
the §1–§6 register. Good.

## Ship recommendation

**Ship with the two MAJOR fixes** (PR count + criterion #3 wiggle room, applied
to both ADR and CONTRIBUTING). The MINOR/NIT items are nice-to-have; the
forward-reference clarity in particular is worth a one-line fix while the file
is open.

The load-bearing claim — that a future agent reviewing a pass-through PR can
point to this amendment and refuse — only holds if criterion #3 is tightened.
Right now any adopter can re-frame their pass-through as "we set a different
default than Better Auth ships" and walk through.

~580 words.
