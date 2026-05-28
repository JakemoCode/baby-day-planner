/** V3 Child repository. One doc per child at `children/{id}`. */

import { doc, getDoc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { childPath } from "@/lib/firestore/paths";
import { v3ChildConverter } from "../firestore/converters";
import type { Child } from "../schemas";

function childRef(db: Firestore, childId: string) {
  return doc(db, childPath(childId)).withConverter(v3ChildConverter);
}

export async function loadChild(db: Firestore, childId: string): Promise<Child | null> {
  const snap = await getDoc(childRef(db, childId));
  return snap.exists() ? snap.data() : null;
}

export async function createChild(db: Firestore, child: Child): Promise<void> {
  await setDoc(childRef(db, child.id), child);
}

export function watchChild(
  db: Firestore,
  childId: string,
  cb: (child: Child | null) => void,
): () => void {
  return onSnapshot(childRef(db, childId), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  });
}
