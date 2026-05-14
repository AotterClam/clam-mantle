# PR #162 review — data-driven SignInView

Baseline: `pnpm --filter @aotter/mantle-cloudflare typecheck` clean,
`pnpm --filter @aotter/mantle-admin-ui typecheck` clean,
`pnpm --filter @aotter/mantle-admin-ui build` clean (510.62 kB index.html,
152.12 kB gzip — within prior envelope).

## Findings

### [HIGH] `?return=` is dropped on email-OTP success — `auth-views.tsx:216`
After `POST /api/auth/sign-in/email-otp` returns 200 the section calls
`window.location.reload()`. The current pathname is still `/admin/sign-in`,
and `AdminApp` (`admin-app.tsx:17`) routes any `/admin/sign-in` request to
`<SignInView />` unconditionally — it never checks the session before showing
the form. The user logs in successfully, then sees the sign-in card again
(with both methods loaded), with no signal that they're already authenticated.
The original `return` query param survives the reload but is ignored.
GitHub path is unaffected because Better Auth's social flow uses
`callbackURL: ret`, which redirects to the return target server-side.
**Fix**: replace `window.location.reload()` with `window.location.assign(returnTo)`,
threading `returnTo` into `EmailOtpSection` the same way `GitHubSignInSection`
already receives it.

### [MED] `/api/auth/methods` should be cache-controlled — `mountServerEndpoints.ts:73`
The endpoint is public-unauthenticated (correct — clients must read it
pre-session) but ships with no `Cache-Control` header. Every cold sign-in
page load (and every failed `me` 401 that bounces to `/admin/sign-in`) hits
the endpoint synchronously. Information leak is benign — analogous to the
`.well-known/oauth-*` documents Better Auth already publishes — but the call
is on the critical path of every sign-in render. **Fix**: add
`Cache-Control: public, max-age=300` (configuration changes are rare and
re-deploys bust the SPA bundle anyway).

### [MED] OTP `send` step doesn't distinguish 200-with-no-OTP from 200-with-OTP-sent
Better Auth's `POST /email-otp/send-verification-otp` always returns
`200 { success: true }` regardless of whether the OTP was actually sent:
when `disableSignUp` is true AND the user does not exist, Better Auth
silently drops the request (`routes.mjs:99-103`). The PR keeps `disableSignUp`
unset (default `false`), so today every email triggers a send — fine. If a
future adopter sets `disableSignUp: true` via a new field (already a likely
extension), the SPA will move to step 2 for unknown emails and trap the user
on "invalid code". **Fix**: not blocking on this PR; once `disableSignUp` is
exposed, the SPA needs a softer step-2 copy that admits "if your email is
registered, a code is on the way" — same pattern as password resets. Track
as a follow-up.

### [LOW] `AuthMethodKind` defined twice — `auth-views.tsx:67` mirrors `createAuth.ts:323`
The SPA hand-redeclares `"github" | "email-otp"`. If the adapter adds
`passkey` ahead of an SPA rebuild, the server response will narrow to
`UnknownMethodSection` via `MethodSection`'s exhaustive check — graceful.
TypeScript composition is fine. Document the duplication: the SPA isn't a
build-time dep of the adapter (the SPA ships pre-built into `dist/`), so
sharing the type would force a runtime package extraction. Comment in
`auth-views.tsx` would prevent the next contributor from "fixing" this.

### [LOW] Hard-coded `/api/auth/*` paths — SPA and mount both bake in `/api/auth`
Better Auth supports `basePath` overrides via `betterAuthOptions.basePath`.
The cloudflare adapter does not expose it on `CreateAuthConfig`, so the
mount + SPA stay consistent. If someone later threads `basePath` through,
the SPA breaks silently. **Fix**: not now. Add a CLAUDE.md / ADR note that
`/api/auth` is a structural invariant between SPA and adapter; either both
move or neither.

### [LOW] Race not present, but worth noting — `auth-views.tsx:79`
`cancelled` flag is set in cleanup and checked before both `setMethods` and
`setError`. Pattern is correct; no React 19 strict-mode-double-mount hazards
because the fetch is idempotent and side-effect-free.

### [INFO] `autocomplete="one-time-code"` is the correct token
Per WHATWG HTML §autofill, `one-time-code` is the registered token for
SMS / email-delivered codes. iOS Safari (≥12), Chrome/Edge (≥84) honor it
for the WebOTP API on SMS and for keyboard suggestions parsing inbound
mail. No change needed.

### [INFO] i18n key with `-` is fine
`"auth.signIn.method.email-otp.body"` works because the keys are plain
object property strings — Vite / esbuild / TS treat them as opaque.
Verified in build output (keys preserved verbatim).

### [INFO] First-staff promotion path via email-OTP works
`shouldPromoteToOwner` checks `user.email`. Better Auth's
`/sign-in/email-otp` creates the user inline (`disableSignUp=false`, the
default) → `databaseHooks.user.create.after` fires → owner promoted if the
email matches `bootstrapOwner.value`. Walked through `createAuth.ts:175-186,
288-313` against `email-otp/routes.mjs:402-422`. No short-circuit.

### [INFO] RTL rendering is fine
Form uses symmetric `px-3 py-2` (not logical properties, but symmetric so
visually identical in RTL). Text direction follows document `dir` from
`preferences.tsx`. OTP `inputMode="numeric"` shows the same keyboard in
RTL — numeric input is direction-neutral.

## Top 3 test gaps (out of scope for this PR)

1. **SPA-level: `SignInView` renders `GitHubSignInSection` when
   `/api/auth/methods` returns `["github"]`** — guard against accidental
   regression where someone ships the OTP form unconditionally. Needs a
   minimal MSW/Vitest setup; none exists yet.
2. **Adapter-level: `GET /api/auth/methods` returns method `kind`s in
   registration order, never config fields.** Type-only contract today.
   Snapshot test against `auth.methods` for a two-method config.
3. **End-to-end: OTP verify response sets the session cookie + a follow-up
   GET to `/api/me` returns the user.** Currently no integration test
   exercises the full email-OTP loop end-to-end; first-staff promotion
   is implicitly untested.

## Ship recommendation

**Fix the HIGH then ship.** The dropped `?return=` is a real UX regression
that ships email-OTP "broken" for any deep link into the admin. The MEDs
are non-blocking polish — file as follow-ups against the email-OTP epic.
The LOWs and INFOs are documentation hygiene.
