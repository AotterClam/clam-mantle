import type { AnyHandler } from "@aotter/mantle-runtime";
import { captchaCheck } from "./captchaCheck.js";
import { slackNotify } from "./slackNotify.js";

/**
 * Handler registry the runtime resolves `Procedure.handler.ref` against.
 * Keys here MUST match the `ref` values declared in
 * `manifests/contact.yaml`.
 */
export const handlers: Readonly<Record<string, AnyHandler>> = {
  captchaCheck: captchaCheck as AnyHandler,
  slackNotify: slackNotify as AnyHandler,
};
