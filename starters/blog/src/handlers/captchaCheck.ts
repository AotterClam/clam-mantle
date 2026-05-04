import { InvokeFailure, type HandlerContext } from "@aotter/mantle-runtime";
import { runtimeDiagnostic } from "@aotter/mantle-spec";

/**
 * `before_create` hook on `contact-messages`. Verifies the CAPTCHA
 * token the visitor's form submission carried.
 *
 * v0.1.0 stub: rejects only the literal `recaptchaToken === "fail"`
 * so smoke tests can exercise the abort path without setting up a
 * real Turnstile siteverify call. Real verification is one fetch
 * away — replace this body with a Turnstile / hCaptcha siteverify
 * POST when shipping to production.
 *
 * Per POC ADR-0014: throwing here aborts the create when the Trigger
 * declares `errorPolicy: abort`. We throw `InvokeFailure` (not a
 * plain `Error`) so the diagnostic carries `AUTH_DENIED`, which the
 * mount layer maps to HTTP 403 — the right code for "your form
 * submission was rejected by the abuse-prevention check." A plain
 * `throw new Error(...)` would surface as `INTERNAL_ERROR` (500),
 * which falsely implies a server bug.
 */
export async function captchaCheck(
  input: { recaptchaToken?: string },
  _ctx: HandlerContext,
): Promise<{ ok: true }> {
  if (input.recaptchaToken === "fail") {
    throw new InvokeFailure(
      runtimeDiagnostic({
        code: "AUTH_DENIED",
        severity: "error",
        path: "captcha-check",
        expected: "valid CAPTCHA token (Turnstile / hCaptcha siteverify)",
        message: "CAPTCHA verification failed.",
      }),
    );
  }
  return { ok: true };
}
