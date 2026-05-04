import type { HandlerContext } from "@aotter/mantle-runtime";

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
 * declares `errorPolicy: abort`; the surrounding HTTP request returns
 * a structured `{ ok: false, diagnostic }` response.
 */
export async function captchaCheck(
  input: { recaptchaToken?: string },
  _ctx: HandlerContext,
): Promise<{ ok: true }> {
  if (input.recaptchaToken === "fail") {
    throw new Error("CAPTCHA verification failed");
  }
  return { ok: true };
}
