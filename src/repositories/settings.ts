import { doc, getDoc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import type { Settings } from "@/domain";
import { settingsPath } from "@/lib/firestore/paths";
import { settingsConverter } from "@/lib/firestore/converters";

function settingsRef(db: Firestore, childId: string) {
  return doc(db, settingsPath(childId)).withConverter(settingsConverter);
}

export async function getSettings(db: Firestore, childId: string): Promise<Settings | null> {
  const snap = await getDoc(settingsRef(db, childId));
  return snap.exists() ? snap.data() : null;
}

export async function saveSettings(
  db: Firestore,
  childId: string,
  settings: Settings,
): Promise<void> {
  await setDoc(settingsRef(db, childId), settings);
}

export function watchSettings(
  db: Firestore,
  childId: string,
  cb: (settings: Settings | null) => void,
): () => void {
  return onSnapshot(settingsRef(db, childId), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  });
}
