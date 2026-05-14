/**
 * Optional transactional-email sender port. Not part of the required
 * v0.1.0 provisioning path — starters must keep working without an
 * implementation. The port is opted into by features that need to
 * send email: passwordless sign-in (Better Auth email-OTP /
 * magic-link), order-confirmation receipts, etc.
 *
 * Per ADR-0014, identity / session / OAuth wiring lives in the
 * adapter (Better Auth instance). The Better Auth `emailOTP` and
 * `magicLink` plugins accept a `sendVerificationOTP` /
 * `sendMagicLink` callback; the adapter binds those callbacks to an
 * `EmailSender` instance. Keeping the port shape here means the
 * sender contract stays adapter-portable — Cloudflare can ship a
 * Resend / Postmark / MailChannels impl; Netlify can ship a SendGrid
 * impl; a future Bun adapter can ship a SMTP impl — all against this
 * one interface.
 *
 * # Localization
 *
 * `sender.send()` takes a `locale` (BCP 47). The SDK never owns
 * email body templates — translating "Your verification code is
 * 123456" into N languages is an adopter-side concern. The locale
 * field is the contract: whoever wires the sender decides how to
 * branch on it (template lookup, i18next, hard-code one language,
 * etc.). For Better Auth-driven flows the locale is the request's
 * `Accept-Language` if available, otherwise the site's canonical
 * locale.
 */
export interface EmailSender {
  send(args: EmailSendArgs): Promise<void>;
}

export interface EmailSendArgs {
  readonly to: string;
  readonly subject: string;
  /** Plain-text body — always required so non-HTML clients work. */
  readonly text: string;
  /** Optional HTML body. */
  readonly html?: string;
  /**
   * BCP 47 locale the recipient is expected to read. Sender
   * implementations decide how (or whether) to act on it.
   */
  readonly locale: string;
  /**
   * Optional categorization the sender may use for templating or
   * deliverability segmentation (e.g. "auth.email-otp.sign-in",
   * "auth.magic-link.email-verification"). The SDK populates this
   * for Better Auth flows so a Resend / Postmark impl can split into
   * separate templates without re-parsing the subject.
   */
  readonly category?: string;
}
