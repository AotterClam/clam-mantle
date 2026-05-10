import type { HandlerContext } from "@aotterclam/clam-cms-runtime";

/**
 * `after_create` hook on `contact-messages`. Notifies a Slack
 * incoming webhook (or, in the v0.1.0 stub here, just logs to
 * `console.info`) so editors see new contact submissions.
 *
 * `errorPolicy: continue` (the after_* default): if this throws, the
 * mutation already succeeded and the throw is swallowed via
 * `console.error`. Authors who care about delivery should add their
 * own retry / dead-letter queue here.
 *
 * Production wiring: read `env.SLACK_WEBHOOK_URL` (via `ctx.env`)
 * and POST a JSON payload to it. v0.1.0 keeps the handler typed
 * vendor-agnostic so swapping for Discord / email / Linear is a
 * one-line change.
 */
export async function slackNotify(
  input: { name?: string; email?: string; message?: string },
  _ctx: HandlerContext,
): Promise<{ ok: true }> {
  console.info(
    `[contact] new submission`,
    JSON.stringify({ name: input.name, email: input.email, message: input.message }),
  );
  return { ok: true };
}
