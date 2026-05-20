/**
 * §F3 PR #2: email-delivery stub for co-parent invites.
 *
 * Today this is a no-op. v1 ships with copy-to-clipboard UX only — the
 * inviter texts/iMessages/Slacks the link to the recipient themselves.
 *
 * When `NEXT_PUBLIC_EMAIL_INVITES` is enabled (separate follow-up PR that
 * picks a provider — likely Firebase "Trigger Email" extension or a Next
 * API route hitting Resend), this fn will be the single integration point.
 * The provider choice is deliberately deferred — it locks us into a vendor
 * and isn't necessary for first dogfood (Jake + Kelly are the only invitees).
 *
 * Callers should `void sendInviteEmail(...)` — the stub returns immediately;
 * the real impl will be best-effort fire-and-forget so a transient email
 * failure never blocks the inviter from completing their flow.
 */

const EMAIL_ENABLED = process.env.NEXT_PUBLIC_EMAIL_INVITES === "true";

export type SendInviteEmailInput = {
  /** Invite token; embedded in the link the recipient clicks. */
  token: string;
  /** Recipient email address. */
  to: string;
  /** Display name of the inviter, for the email subject/body. */
  fromDisplayName: string;
  /** Display name of the child being shared, for the email body. */
  childDisplayName: string;
};

export async function sendInviteEmail(_input: SendInviteEmailInput): Promise<void> {
  if (!EMAIL_ENABLED) return;
  // TODO(post-PR #2): wire the actual provider here. Until then, even when
  // the flag flips on, sending is a no-op — the recipient still needs the
  // copy-link UX. Provider choice + integration land in a separate PR.
}
