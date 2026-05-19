/**
 * V3 Invite repository — §F3 PR #2 co-parent invite flow.
 *
 * /invites/{token} is the single source of truth for a pending invitation.
 * `consumeInvite` runs as a transaction so the invite-mark-consumed and the
 * consumer's `users/{uid}.childIds` append succeed or fail together; partial
 * failure can never leave a "marked consumed but not joined" zombie.
 */

import {
  arrayUnion,
  doc,
  getDoc,
  runTransaction,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { invitePath, userPath } from "@/lib/firestore/paths";
import { v3InviteConverter, v3UserConverter } from "../firestore/converters";
import type { Invite, User } from "../schemas";

function inviteRef(db: Firestore, token: string) {
  return doc(db, invitePath(token)).withConverter(v3InviteConverter);
}

function userRef(db: Firestore, uid: string) {
  return doc(db, userPath(uid)).withConverter(v3UserConverter);
}

export async function loadInvite(db: Firestore, token: string): Promise<Invite | null> {
  const snap = await getDoc(inviteRef(db, token));
  return snap.exists() ? snap.data() : null;
}

export async function createInvite(db: Firestore, invite: Invite): Promise<void> {
  await setDoc(inviteRef(db, invite.token), invite);
}

/**
 * Atomically: mark invite consumed AND add childId to the consumer's user doc.
 * Throws on: not found / already consumed / expired / creator-is-consumer.
 *
 * Returns the childId the consumer just joined, so the caller can route.
 */
export async function consumeInvite(
  db: Firestore,
  token: string,
  consumerUid: string,
): Promise<{ childId: string }> {
  return runTransaction(db, async (tx) => {
    const invSnap = await tx.get(inviteRef(db, token));
    if (!invSnap.exists()) {
      throw new Error("Invite not found.");
    }
    const invite = invSnap.data();
    if (invite.createdBy === consumerUid) {
      throw new Error("You can't consume your own invite.");
    }
    if (invite.consumedBy) {
      throw new Error("Invite already consumed.");
    }
    if (invite.expiresAt < Date.now()) {
      throw new Error("Invite has expired.");
    }

    const userSnap = await tx.get(userRef(db, consumerUid));
    if (userSnap.exists()) {
      tx.update(userRef(db, consumerUid), { childIds: arrayUnion(invite.childId) });
    } else {
      const newUser: User = {
        uid: consumerUid,
        childIds: [invite.childId],
        createdAt: Date.now(),
      };
      tx.set(userRef(db, consumerUid), newUser);
    }
    tx.update(inviteRef(db, token), {
      consumedBy: consumerUid,
      consumedAt: Date.now(),
    });

    return { childId: invite.childId };
  });
}
