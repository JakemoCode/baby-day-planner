/**
 * Email-delivery stub for co-parent invites. Currently a no-op; v1 ships
 * with copy-to-clipboard only. Wire the real provider here when
 * `NEXT_PUBLIC_EMAIL_INVITES` is enabled. Callers should `void` this — it
 * is always fire-and-forget so email failure never blocks the invite flow.
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
  // TODO: wire provider here. Flag on still no-ops until then.
}
