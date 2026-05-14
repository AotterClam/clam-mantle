/**
 * Optional transactional-email sender port. Lives in runtime/domain/port
 * so the contract stays adapter-portable (Resend / Postmark / SendGrid /
 * SMTP all implement this one interface). Not required for v0.1.0 boot —
 * features opt in (Better Auth email-OTP / magic-link, receipts, etc.).
 *
 * The SDK does not own body templates. `locale` (BCP 47) is the contract:
 * the sender decides how to branch (template lookup, i18next, single
 * language). For Better Auth flows the adapter resolves locale from the
 * request's `Accept-Language`, falling back to the site's canonical locale.
 *
 * `category` lets a sender split into per-template lanes without re-parsing
 * the subject — e.g. `"auth.email-otp.sign-in"` vs
 * `"auth.email-otp.email-verification"`.
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
  /** BCP 47 locale the recipient is expected to read. */
  readonly locale: string;
  /** Optional categorization for templating / deliverability segmentation. */
  readonly category?: string;
}
