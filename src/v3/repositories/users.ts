/**
 * V3 User repository.
 *
 * One doc per auth user at `users/{uid}`. Created on first sign-in (or
 * on onboarding submit — see ChildProvider). `childIds` is the list of
 * children this uid can access; an empty array means "signed in but
 * hasn't onboarded yet" and gates the welcome flow.
 *
 * Co-parent invites (PR #2) append childIds via `addChildToUser`.
 */

import {
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { userPath } from "@/lib/firestore/paths";
import { v3UserConverter } from "../firestore/converters";
import type { User } from "../schemas";

function userRef(db: Firestore, uid: string) {
  return doc(db, userPath(uid)).withConverter(v3UserConverter);
}

export async function loadUser(db: Firestore, uid: string): Promise<User | null> {
  const snap = await getDoc(userRef(db, uid));
  return snap.exists() ? snap.data() : null;
}

export async function createUser(db: Firestore, user: User): Promise<void> {
  await setDoc(userRef(db, user.uid), user);
}

export async function addChildToUser(db: Firestore, uid: string, childId: string): Promise<void> {
  await updateDoc(doc(db, userPath(uid)), { childIds: arrayUnion(childId) });
}

export function watchUser(db: Firestore, uid: string, cb: (user: User | null) => void): () => void {
  return onSnapshot(userRef(db, uid), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  });
}
