# PR #161 review — `feat/issue-158-email-otp-login`

Reviewer: Claude. Scope: 1a7f842 vs `origin/develop`. Typecheck + 44 tests pass.
Refs: Better Auth 1.6.9 `dist/plugins/email-otp/{index,routes}.mjs`,
`api/rate-limiter/index.mjs:154`, `context/create-context.mjs:168, 211-220`.

## 1. Locale parsing — **[Minor]**

Standard `Accept-Language` case is fine. Empty header, weird whitespace, lone
`*` all degrade via the `.trim()` + length check. Real concern: `ctx?.request`
is `undefined` in Better Auth's server-initiated paths (sign-up trigger hook
at `index.mjs:66-71`, direct `auth.api.sendVerificationOTP` calls). Optional
chain handles it, but `fallbackLocale` always wins there.

**Why it matters**: silent fallback to `en` for non-`en` sites is UX rot, not
a bug.
**Fix**: doc note on `fallbackLocale` that server-initiated sends always use it.

## 2. Email enumeration via OTP send — **[Nothing material]**

Verified `routes.mjs:99-109`. `type: "sign-in"` always returns
`{ success: true }`. `email-verification`/`forget-password` silently no-op
when user is missing. No leak. (If an adopter flips `disableSignUp: true`,
the signal returns — doc only.)

## 3. OTP send rate limiting — **[Major]**

The plugin ships per-route limits (60s/3), but `rate-limiter/index.mjs:154`
gates the limiter on `ctx.rateLimit.enabled`. Default is `isProduction`, which
reads `process.env.NODE_ENV` — typically unset on Workers → `enabled: false`
→ **per-route limits don't fire**. Our `createAuth.ts:227` only enables when
adopter passes `config.rateLimit`. By default the send-OTP endpoint is
unrate-limited.

**Why it matters**: one bad actor drains the adopter's Resend/Postmark daily
quota. Vibe-coder won't notice until the bill.
**Fix**: when an `email-otp` method is registered, default
`rateLimit.enabled: true` (still honor adopter `window`/`max`). Plugin's
60s/3 then actually applies.

## 4. `sendVerificationOTP` await semantics — **[Major]**

We `await method.sender.send(...)`. Two issues:

1. **Timing oracle**: for `email-verification`/`forget-password` the send
   only runs when user exists (`routes.mjs:100`). Awaiting leaks existence
   via response latency. Better Auth's doc explicitly warns about this.
2. **Workers lifecycle**: Better Auth wraps in `runInBackgroundOrAwait`.
   With `advanced.backgroundTasks.handler` wired, the promise goes to
   `waitUntil` and the response returns early. We don't wire it; falls
   through to inline await (`create-context.mjs:217`). The adapter already
   extracts `waitUntil` per-request in `mountServerEndpoints.ts:432`.

**Why it matters**: leaks user existence; blocks the Workers response on SMTP.
**Fix**: wire `advanced.backgroundTasks.handler` to dispatch via
`ctx.waitUntil` when present, inline-await otherwise. Upstream's documented
fix; resolves both at one site.

## 5. `emailVerified` flag — **[Nothing material]**

`grep -rn emailVerified packages/` returns only the migration column. No gate
reads it. Better Auth sets it true after OTP verify; we don't care.

## 6. `bootstrapOwner.match: "email"` + first OTP signup — **[Nothing material]**

Walked it: send-verification-otp → sign-in/email-otp → `findUserByEmail` null
→ `createUser` (`emailVerified: true`) → `user.create.after` fires →
`shouldPromoteToOwner` matches (lowercased both sides) → existingAdmin SELECT
guards re-promotion → `UPDATE role`. Correct.

Side note: same email later signs in via GitHub → OAuth callback links to
existing user, does **not** invoke `user.create.after` again. Idempotent.

## 7. `ConsoleEmailSender` in production — **[Minor]**

JSDoc warns; boot doesn't stop you. `wrangler dev` → `wrangler deploy` ships
a working-looking auth UI that never delivers email. `NODE_ENV === "production"`
guard is low-signal on Workers (see #3).

**Why it matters**: silent prod email loss = the exact "broken safety promise"
CLAUDE.md calls out.
**Fix**: minimum a once-only `console.warn` on first `send()`. Strong: re-export
from `@aotter/mantle-cloudflare/dev` only (file follow-up).

## 8. Single-`email-otp`-only — **[Nothing material]**

`emailOtpMethods.length > 1` throws — correct, plugin instances carry state.

## 9. Account linking — **[Minor]**

Default `accountLinking.enabled` is true.

- **GitHub first → OTP same email**: `signInEmailOTP` (`routes.mjs:402`)
  finds existing user, signs them in. No account row added for email-otp;
  `user.create.after` does not fire; bootstrap already ran on GitHub signup.
  Correct.
- **OTP first → GitHub same email**: callback link-account at
  `oauth2/link-account.mjs:20` requires `trustedProviders` OR
  `userInfo.emailVerified`. If GitHub returns an unverified email and we
  haven't trusted it, callback redirects `email_doesn't_match`. Adopters
  likely want `accountLinking.trustedProviders: ["github"]`; deferred.

**Fix**: CHANGELOG / ADR-0014 doc note; no code this PR.

## 10. Test coverage — **[Major]**

No unit tests exist for `createAuth.ts`. Three priority gaps:

1. **`pickLocale` table-test** — pure function, ~30 lines: happy path,
   missing header, empty header, `req: undefined`, whitespace.
2. **`emailOtpMethods.length > 1` throws** — one assertion pins the constraint.
3. **`shouldPromoteToOwner` matrix** — case-insensitive email + github-login,
   missing fields. Gains a new arm in this PR.

Integration test (in-process auth + fake sender) — nice, not blocking.

---

## Ship recommendation

**Hold for two fixes:**

1. Default `rateLimit.enabled: true` when `email-otp` is registered, so the
   plugin's 60s/3 limits apply on Workers (#3).
2. Wire `advanced.backgroundTasks.handler` to per-request `ctx.waitUntil`
   so OTP send stops leaking timing and blocking Workers responses (#4).

Add the `pickLocale` unit tests at minimum (#10.1).

Everything else is doc / follow-up. PR shape is sound: Sender port stays
portable, union variant is well-scoped, single-OTP invariant enforced, and
bootstrap-via-email walks through cleanly. The two holds are upstream
knowledge gaps, fixable inside `buildAuth`.
