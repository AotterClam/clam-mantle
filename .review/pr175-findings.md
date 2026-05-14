# PR #175 review — Apple trustedOrigins + betterAuthOptions escape hatch

Scope: correctness/security/design. Verified against `better-auth@1.6.9` +
`@better-auth/core@1.6.9` in `node_modules`.

## F1 — [HIGH] Shallow spread shadows nested adopter sub-trees

Merge is `{ ...config.betterAuthOptions, ...sdkKeys }`. The SDK re-asserts
`advanced`, `user`, `databaseHooks` at the top level — the entire adopter object
under each is **dropped**. Adopter `betterAuthOptions: { advanced: { defaultCookieAttributes: {…} } }`
loses `defaultCookieAttributes` (SDK's `advanced: { backgroundTasks }` replaces
the whole thing); adopter `user.additionalFields.signupSource` is replaced by
SDK's `additionalFields.githubLogin`; adopter `databaseHooks.user.create.before`
or any `databaseHooks.session.*` / `databaseHooks.account.*` silently vanishes.

This is the **opposite** of the docstring claim ("SDK keys win on overlap").
What ships is "SDK key shadows the entire adopter sub-tree." Hits the most
likely escape-hatch uses (account.accountLinking — referenced in CHANGELOG —
is actually safe because it's `account` not `advanced`, but `advanced`
cookie attrs are the canonical Apple workaround, see F2).

**Fix:** deep-merge for `advanced`/`user`/`databaseHooks` with adopter as base
and SDK overriding only the three specific leaves we own
(`advanced.backgroundTasks`, `user.additionalFields.githubLogin`,
`databaseHooks.user.create.after` — keep adopter `.before`!).

## F2 — [HIGH] Apple flow still broken after trustedOrigins

Apple uses `responseMode: "form_post"` (`@better-auth/core/.../apple.mjs:30`) —
Apple POSTs cross-site to the callback. Better Auth's default cookies are
`sameSite: "lax"` (`better-auth/.../cookies/index.mjs:32`) and default
`storeStateStrategy` is `"cookie"`. `Lax` cookies are **not** sent on cross-site
POST → `oauth_state` cookie missing on callback → `state_mismatch`.
TrustedOrigins is necessary but not sufficient; the PR ships a half-fix that
gives adopters false confidence the recipe works.

Compounded by F1: even if the adopter knows to pass
`betterAuthOptions: { advanced: { defaultCookieAttributes: { sameSite: "none", secure: true } } }`,
F1 silently drops it.

**Fix:** when `apple` is registered, also auto-wire
`advanced.defaultCookieAttributes.sameSite = "none"` (+ `secure: true`), OR
`account.storeStateStrategy = "database"`. Cleanest: extend
`SOCIAL_PROVIDER_TRUSTED_ORIGINS` into a richer per-provider wiring table.

## F3 — [MED] Better Auth does NOT dedupe plugins by id

Docstring + CHANGELOG claim "Better Auth dedupes per `plugin.id`." False.

- `create-context.mjs:89` → `plugins.concat(internalPlugins)`, no dedupe.
- `to-auth-endpoints.mjs:284,288` → `plugins.flatMap(p => p.hooks?.before)` —
  **both** dups' hooks fire.
- `api/index.mjs:84` → `.reduce((acc, p) => ({ ...acc, ...p.endpoints }))` —
  last-wins per endpoint key (so SDK-last ordering gets routing right by
  accident), but not dedupe.
- `api/index.mjs:60` logs `logger.error` on conflict; never throws/strips.

Adopter passing a second `admin()` gets admin hooks fired twice per request +
a logger error in production. Unlikely in practice, but the docstring is a
load-bearing lie.

**Fix:** explicit dedupe in `buildAuth` —
`Array.from(new Map([...adopter, ...sdk].map(p => [p.id, p])).values())` so
SDK (declared later, overwrites in Map) wins. Update comment + CHANGELOG.

## F4 — [MED] `trustedOrigins: function` silently downgraded to `string[]`

`BetterAuthOptions["trustedOrigins"]` is `string[] | function`
(`init-options.d.mts:1044`). PR does
`Array.isArray(adopterTrustedOrigins) ? adopterTrustedOrigins : []`. Function
shape (dynamic / multi-tenant / Vercel-preview pattern) is **silently dropped**;
the adopter's dynamic check vanishes, only Apple's origin remains.

**Fix:** if function-shape, wrap into a new function that awaits the adopter
result, unions with SDK auto-origins, dedupes. Or throw at construction
("function-shape trustedOrigins + Apple not yet supported") — anything but
silent strip.

## F5 — [LOW] Test "SDK wins over betterAuthOptions" is weak

Asserts via `auth.methods`, which is derived from `config.methods` in
`createAuth` lines 672-677, not from Better Auth's `socialProviders.github`.
Would pass even if the merge were inverted and `"BAD"` leaked. Acknowledged in
the comment; out-of-scope for unit tests but the invariant isn't exercised.

**Fix (follow-up):** integration smoke that POSTs to `/api/auth/sign-in/social`
and inspects upstream URL for the SDK clientId.

## F6 — [LOW] `Partial<BetterAuthOptions>` is type-redundant

`BetterAuthOptions` is already `type` with every field `?`. Identity wrap.
Signals intent; leave.

## F7 — [INFO] Auto-origins map correctly Apple-only

Spot-check: only `apple.mjs` ships `responseMode: "form_post"`. Other 33
providers use redirect-GET callback → state cookie is Same-site nav, Lax is
fine, no trustedOrigins entry needed. `SOCIAL_PROVIDER_TRUSTED_ORIGINS` scope
is correct.

## Ship recommendation

**Block on F1 + F2.** F1 silently loses the adopter's escape data — the
opposite of what ADR-0014 and the docstring promise. F2 means the PR's
headline feature (Apple "just works") doesn't, and F1 prevents the documented
workaround from working either.

Suggested gate:
1. **Required before merge:** F1 deep-merge for `advanced`/`user`/`databaseHooks`;
   F2 auto-wire `sameSite=none` for Apple (extend the Apple table).
2. **Same PR or fast-follow:** F3 explicit plugin dedupe + correct docstring.
3. **Issue:** F4 function-shape trustedOrigins; F5 integration smoke.

Tests pass + typecheck clean as-shipped, but the green tests don't cover any of
F1-F4. Three of the four findings are bypassed by the test surface.
