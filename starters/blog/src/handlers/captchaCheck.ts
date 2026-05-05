import { InvokeFailure, type HandlerContext } from "@aotter/mantle-runtime";
import { runtimeDiagnostic } from "@aotter/mantle-spec";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResponse {
  readonly success: boolean;
  readonly "error-codes"?: readonly string[];
}

/**
 * `before_create` hook on `contact-messages`. Verifies the Turnstile
 * token the visitor's form submission carried. The starter wires
 * this Procedure with `errorPolicy: abort`, so throwing
 * `InvokeFailure(AUTH_DENIED)` aborts the create with HTTP 403.
 *
 * Two modes, picked by the value of `TURNSTILE_SECRET_KEY`:
 *
 *   - `"dev-stub"` (the .dev.vars default): short-circuit with a
 *     literal-string check — `turnstileToken === "fail"` is rejected,
 *     anything else passes. Keeps the integration smokes deterministic
 *     and lets the starter run with zero network. Tests assert on
 *     this token shape.
 *
 *   - any other value: real Turnstile siteverify. Default site key
 *     in wrangler.toml is CF's "always passes" test key, paired with
 *     a real secret from `wrangler secret put TURNSTILE_SECRET_KEY`
 *     in production.
 *
 * Throwing `InvokeFailure` (not a plain `Error`) so the diagnostic
 * carries `AUTH_DENIED` — mount layer maps to HTTP 403, the right
 * code for "your form submission was rejected by abuse-prevention."
 * `throw new Error(...)` would surface as INTERNAL_ERROR (500) and
 * falsely imply a server bug.
 */
export function buildCaptchaCheck(env: { TURNSTILE_SECRET_KEY?: string }) {
  const secret = env.TURNSTILE_SECRET_KEY ?? "dev-stub";
  return async function captchaCheck(
    input: { turnstileToken?: string },
    ctx: HandlerContext,
  ): Promise<{ ok: true }> {
    // Authenticated callers (MCP agents, admin UI) bypass captcha —
    // it guards anonymous public-form abuse, not signed-in writes.
    if (ctx.user) return { ok: true };
    const token = input.turnstileToken;
    if (!token) reject("missing turnstile token");
    if (secret === "dev-stub") {
      if (token === "fail") reject("dev-stub rejected literal 'fail' token");
      return { ok: true };
    }
    const verified = await verifyWithTurnstile(secret, token!);
    if (!verified.success) {
      reject(
        `Turnstile siteverify rejected: ${(verified["error-codes"] ?? ["unknown"]).join(", ")}`,
      );
    }
    return { ok: true };
  };
}

async function verifyWithTurnstile(secret: string, token: string): Promise<TurnstileVerifyResponse> {
  const body = new URLSearchParams({ secret, response: token });
  const res = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) reject(`Turnstile siteverify HTTP ${res.status}`);
  return (await res.json()) as TurnstileVerifyResponse;
}

function reject(detail: string): never {
  throw new InvokeFailure(
    runtimeDiagnostic({
      code: "AUTH_DENIED",
      severity: "error",
      path: "captcha-check",
      expected: "valid Turnstile token verified by siteverify",
      message: `CAPTCHA verification failed: ${detail}.`,
    }),
  );
}
