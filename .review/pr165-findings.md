# PR #165 — `feat/issue-164-magic-link-method` review findings

Reviewer: orchestrator. Scope: **correctness / security / design holes**.
Stylistic findings deferred to the parallel simplifier worktree.

Baseline green: cloudflare typecheck ✔, admin-ui typecheck ✔, cloudflare vitest 44/44 ✔.

---

## 1. `callbackURL` honesty (open-redirect-in-email) — **NONE / safe**

Walk-through:

- SPA POSTs `{ email, callbackURL: returnTo }` to `/sign-in/magic-link`.
  `returnTo` is the SPA-decoded `?return=` param, a relative path.
- Better Auth's router-level `originCheckMiddleware` matches `/**` and on
  POST runs `isTrustedOrigin(body.callbackURL, { allowRelativePaths: true })`
  before the plugin handler even sees the body
  (`api/middlewares/origin-check.mjs:39-65`, registration at
  `api/index.mjs:156-159`).
- `getTrustedOrigins` defaults to `[new URL(baseURL).origin]`
  (`context/helpers.mjs:60-85`). An attacker submitting
  `callbackURL: "https://evil.example.com/x"` hits
  `INVALID_CALLBACK_URL` → 403; the email never sends.
- The `/magic-link/verify` GET also calls `originCheck(query.callbackURL)`
  (`plugins/magic-link/index.mjs:86-95`), defence-in-depth even if a
  signed token leaked.

The allow-relative regex
`/^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/` rejects
protocol-relative `//evil`, encoded slashes `%2f`, and backslash tricks.
Solid. **Rationale: any cross-origin callback is rejected at POST time
before email send.** **Fix: none.**

## 2. Sender-locale at send vs click time — **LOW / accepted**

`sendMagicLink` captures locale from `Accept-Language` of the POST that
generated the link. Verification is server-side via GET `/magic-link/verify`
and redirects to `callbackURL`; no locale-sensitive HTML is rendered.
**Rationale: only the email body is locale-bound, and that's correctly
keyed to send-time. Click-time is opaque to locale.** **Fix: none.**

## 3. Magic-link verification redirect path — **NONE / safe**

`/magic-link/verify` sets the session cookie via `setSessionCookie` then
`throw ctx.redirect(callbackURL)` (`plugins/magic-link/index.mjs:153-163`).
The redirect lands the browser on, e.g., `/admin/c/posts` with the
session cookie set — no SPA-bootstrap dependency. The admin SPA's auth
gate (PR #44) reads the cookie on next request. **Rationale: cookie set
before redirect; SPA doesn't need to be on `/admin/sign-in` first.**
**Fix: none.**

## 4. Singleton invariant — **NONE / fine**

Refactored into `pickSingleton<K>()` helper (line 234 of createAuth.ts);
covers `email-otp` and `magic-link` with one throw site. Net cleaner than
the inline filter shown in the task spec — the simplification pass
landed before merge. **Rationale: throws at construction, single
exhaustive code path.** **Fix: none.**

## 5. Cross-method account linking — **MED / deferred but worth flagging in PR body**

Better Auth's behavior with `account.accountLinking` left unset:
**defaults to enabled, but only links from OAuth → existing email user
when the OAuth provider is in `trustedProviders` OR `userInfo.emailVerified` is true**
(`oauth2/link-account.mjs:19-21`). Magic-link's `findUserByEmail` path
at `index.mjs:139` will **reuse the existing user** (whether created by
GitHub or email-otp) and skip the `createUser` branch — so all three
methods converge on the same `user.id`. Bootstrap promotion fires on the
**first** user create only; subsequent method registrations against the
same email are no-ops (no risk of re-promoting). The risk surface is
inverse: a user signs in via GitHub first (no email match against
`bootstrapOwner.match='email'`) but later uses magic-link with the
target email — `databaseHooks.user.create.after` won't fire because
the user already exists, so they never auto-promote. **Rationale: the
silent "promotion only on first method" is a footgun for adopters who
register `github` and `magic-link` together and expect any-method-promotes
semantics.** **Fix (follow-up issue, NOT this PR): document on
`bootstrapOwner`'s JSDoc that promotion is first-create-only, and that
GitHub's `email` lands without verification — if `match:'email'` is used
with GitHub registered, the GitHub flow may consume the bootstrap slot.**

## 6. Default `expiresIn` 5 min — **LOW / docs nudge**

Better Auth's 5-min default is tight for email. Inbox delivery latency
(SES/Postmark/Resend: 1-30s typical, up to 2 min under load) plus user
"check mail in a sec" behavior puts a meaningful fraction of clicks
past the window. Slack 60min, Notion/Vercel 24h. **Rationale: 5 min
will surface as "link expired" UX noise in real deployments.** **Fix
(this PR, optional): bump default to 900 (15 min) by passing
`expiresIn: method.expiresInSeconds ?? 900` — keeps adopter override,
ships a saner OOTB. Alternative: leave at 5 min, document in
CHANGELOG / starter README that production should set
`expiresInSeconds: 900` or higher.**

## 7. `allowedAttempts: 1` + mail prefetch — **MED / known UX risk**

Better Auth defaults `allowedAttempts: 1`; the plugin increments the
counter inside `/magic-link/verify` (`index.mjs:129-137`) and any
fetcher (Outlook Safe Links, Mimecast, Proofpoint URL Defense, Gmail
preview crawler in some configs) burns the only attempt. The token also
gets the session cookie set on the prefetcher's IP, not the user's
(though the prefetcher discards it). User then clicks → `ATTEMPTS_EXCEEDED`
→ error redirect. **Rationale: real-world email scanners regularly
consume single-use magic-links — well-documented industry issue.** **Fix
(this PR, recommended): default `allowedAttempts: 3` via
`allowedAttempts: method.allowedAttempts ?? 3`, with a JSDoc note that
3 covers most prefetch scanners while keeping the link single-session.
Better Auth still rotates tokens on verify failure paths. Adopters
with strict policies can set it to 1 explicitly.**

## 8. Rate-limit scope — **LOW / clarification, not a bug**

The PR's "rate-limit default now fires when either email-otp OR magic-link
is registered" comment is correct, **but** the magic-link plugin
self-registers `{ pathMatcher: /sign-in/magic-link|/magic-link/verify,
window: 60, max: 5 }` (`plugins/magic-link/index.mjs:166-172`). Plugin
rules override the global config for matched paths
(`api/rate-limiter/index.mjs:121-128`). So:
- `/sign-in/magic-link`: **5/60s per IP per path** (plugin override).
- `/magic-link/verify`: **5/60s per IP per path** (plugin override).
- Global 10/60s applies to other auth routes (e.g. `/sign-out`,
  `/get-session` paths not matched by special rules).

Scope is **per-IP per-path** via `createRateLimitKey(ip, path)`
(line 115). Storage is D1-backed (no `secondaryStorage` / `customStorage`
configured → falls through to `createDatabaseStorageWrapper`), so
persists across isolates. **Rationale: the rate limit works; the
PR comment slightly oversells global-default coverage on these paths.**
**Fix: optional — update the in-code comment to note the plugin override.**

## 9. IIFE vs `withBusy` — **NONE (resolved)**

The PR's pre-simplification snapshot (origin/feat HEAD) used
`void (async () => …)()`. The local HEAD (`77b4327 chore(pr-d):
simplification pass`) already replaced it with `withBusy`, matching
`EmailOtpSection`. No action.

## 10. Test coverage — **3 priority gaps for follow-up smoke**

a. **`createAuth` registers magic-link plugin and singleton-throws on
   duplicate.** Mirror the email-otp test in
   `cloudflare/test/createAuth.test.ts` — one positive (config →
   `auth.methods` includes `"magic-link"`), one negative (two
   magic-link entries → throws with the singleton message).

b. **`/sign-in/magic-link` rejects cross-origin `callbackURL`.** Issue
   a POST with `callbackURL: "https://evil.example.com/x"`, assert
   403 + `INVALID_CALLBACK_URL`. Locks in the defence and catches
   regressions if someone later misconfigures `trustedOrigins`.

c. **`sendMagicLink` invokes the configured `EmailSender` with the
   resolved locale.** Stub `EmailSender`, fire one POST with
   `Accept-Language: zh-TW,en;q=0.9`, assert `sender.send` received
   `locale: "zh-TW"` and `category: "auth.magic-link.sign-in"`.
   Pairs with the email-otp locale test.

## Ship recommendation — **APPROVE with two small in-PR tweaks**

1. Bump default `allowedAttempts` to 3 (item #7) — one-line change in
   `buildMagicLinkPlugin`. Real UX risk, default is hostile.
2. Bump default `expiresIn` to 900 (item #6) — one-line change. 5 min
   is below industry minimum for email-delivered links.

Everything else (item #5 bootstrap-promotion footgun, item #8 comment
nit, item #10 tests) is follow-up. Security posture is solid:
origin-check covers open-redirect; verification is server-side; rate
limits persist via D1.

Word count: ~640.
