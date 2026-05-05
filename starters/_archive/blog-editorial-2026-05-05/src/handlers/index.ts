import type { AnyHandler } from "@aotter/mantle-runtime";
import { cloudflareTurnstileCheck } from "@aotter/mantle-cloudflare";
import { slackNotify } from "./slackNotify.js";

export interface HandlerEnv {
  readonly TURNSTILE_SECRET_KEY?: string;
}

/**
 * Construct the handler registry the runtime resolves
 * `Procedure.handler.ref` against. Keys MUST match the `ref` values
 * declared in `manifests/contact.yaml`. Takes env so handlers needing
 * secrets (captchaCheck reads TURNSTILE_SECRET_KEY) close over them
 * at boot.
 */
export function buildHandlers(env: HandlerEnv): Readonly<Record<string, AnyHandler>> {
  return {
    captchaCheck: cloudflareTurnstileCheck({
      secret: env.TURNSTILE_SECRET_KEY ?? "dev-stub",
    }) as AnyHandler,
    slackNotify: slackNotify as AnyHandler,
  };
}
