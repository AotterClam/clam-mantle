# PR #173 — `appleClientSecret()` review findings

Branch `feat/issue-172-apple-client-secret-helper` @ `b138ed7`. Typecheck clean. Tests 88/88.

Scope: correctness, security, spec compliance. Style/refactor handled on the simplifier worktree.

---

## 1. ES256 signature format — OK (P1)

The signature returned by `crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, ...)` is an `ArrayBuffer` of IEEE P1363 r||s (64 bytes for P-256). The helper wraps it as `new Uint8Array(signature)` and passes **directly** to `base64UrlEncode` — no DER detour, no re-encoding step. This matches RFC 7518 §3.4. No fix.

## 2. PKCS8 import enforces P-256 — OK (P1)

`importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])` — WebCrypto rejects PKCS8 blobs whose OID disagrees with `namedCurve`. Apple `.p8` is always P-256, but a misuse (e.g. accidentally pasting a P-384 key) fails fast at import with a WebCrypto `DataError`. No fix.

## 3. Whitespace strip / smart-quote artefacts — MINOR (P3)

**Rationale:** JS `\s+` already covers NBSP (` `) and BOM (`﻿`) — those are silently stripped. But smart quotes (`U+201C/D/8/9`) and zero-width chars outside `\s` survive into `atob()`, which throws a terse `InvalidCharacterError`. The current `catch` rewrites it as `"privateKey is not valid base64 — paste the contents of your .p8 file (PEM or base64)."` — which is acceptable.

**Fix (optional):** before `base64ToBytes(body)`, validate `/^[A-Za-z0-9+/=]*$/.test(body)` and throw with the same friendly message — replaces the `atob` exception path with an explicit one and saves the eventual debugger a step. Non-blocking.

## 4. JWT lifetime overflow — OK (no concern)

180d = 15,552,000 — orders of magnitude below `Number.MAX_SAFE_INTEGER`. No fix.

## 5. Timing variability in tests — OK

Tests assert the **lifetime delta** (`exp - iat`), not absolute values. Robust against Date.now() resolution noise. No fix.

## 6. `btoa(String.fromCharCode(...bytes))` in test code — OK (informational)

PKCS8 P-256 keys are ~120 bytes; well below the spread-arg call-stack threshold (~100k on V8). Production helper does NOT use spread — it uses an explicit `for` loop in `base64UrlEncode`. Safe. No fix.

## 7. NaN slips past `expiresIn <= 0` — BUG (P2)

**Rationale:** `NaN <= 0` is `false` and `NaN > APPLE_MAX` is also `false`. A NaN passed as `expiresInSeconds` skates past both guards, yielding `exp: NaN` → `JSON.stringify` serialises as `null` → JWT looks valid locally but Apple rejects with an opaque OAuth error and the adopter chases the bug for hours. Worse than a 30-day cap mismatch because the JWT *signs successfully*.

**Fix:** swap the first guard to `!Number.isFinite(expiresIn) || expiresIn <= 0` and update the error message to `"appleClientSecret: expiresInSeconds must be a positive finite number"`. One line, no behavioural cost.

## 8. `Date.now()` vs Clock port — ACCEPTABLE (P3)

**Rationale:** Yes, taking a `Clock` port would let tests pin `iat`/`exp` exactly. But this helper is a leaf function exported alongside `createAuth` — adopters call it once at boot. Threading a port through a one-shot helper buys deterministic testing at the cost of a noisier public API. Tests already cover what matters (lifetime delta, deterministic given a fixed delta). Don't refactor.

## 9. Adopter footgun: 30-day default vs Workers redeploy cadence — DOC GAP (P2)

**Rationale:** The JSDoc *does* note "regenerate at deploy or via cron" and "isolate boot" timing — but isolate lifetime is **not** redeploy cadence. A Worker isolate can live for hours/days under sustained traffic; the JWT survives across that window. The risk: a Worker that deploys monthly hits exactly the 30-day cliff on busy isolates.

**Fix:** tighten the JSDoc paragraph to explicitly state the contract: "the JWT is generated at module evaluation; isolates that outlive `expiresInSeconds` will start failing Apple OAuth." Optional: lower default to 14d for safety margin — but 30d matches industry norm; leave it. JSDoc tightening is enough.

## 10. Test gaps — list (P2–P3)

1. **NaN expiresInSeconds rejection** — see finding #7; once the guard is fixed, lock the behaviour in.
2. **Exact 180-day boundary (`15552000`) accepted** — current test only exercises the *reject above* path; the off-by-one (`>` vs `>=`) is currently correct (`>`) but untested.
3. **Tamper detection — modified payload fails verify** — sanity check that `crypto.subtle.verify` actually rejects a flipped bit in the payload. Validates the test harness itself.

(Not requested but observed: no test asserts header is exactly `{alg, kid}` with no extras. Minor; the structural `toEqual` in test #1 already does this for the happy path.)

---

## Severity summary

| # | Concern | Severity |
|---|---|---|
| 1 | ES256 r\|\|s, no DER | OK |
| 2 | PKCS8 P-256 enforced | OK |
| 3 | Whitespace / smart quotes | P3 |
| 4 | Lifetime overflow | OK |
| 5 | Timing variability | OK |
| 6 | `btoa(spread)` in test | OK |
| 7 | NaN bypass | **P2** |
| 8 | Clock port | P3 (don't refactor) |
| 9 | 30-day rotation doc | **P2** (doc) |
| 10 | Test gaps | P2/P3 |

## Ship recommendation

**Ship with two fix-forward follow-ups** — both small, neither blocking merge:

1. **(P2, ~3 LOC)** Guard `!Number.isFinite(expiresIn) || expiresIn <= 0` (concern #7), add NaN-rejects test (concern #10.1).
2. **(P2, doc)** Tighten the JSDoc rotation paragraph to distinguish isolate lifetime from redeploy cadence (concern #9).

Cryptographic surface is correct. ES256 r||s format is right, P-256 curve binding is right, error paths are user-helpful. The NaN gap is a footgun, not a vulnerability — the JWT it produces is invalid, not forgeable. JSDoc rotation note is more important than it looks given vibe-coder adopters (CLAM thesis: surface invariants don't get buried in adopter mailing-list folklore).
