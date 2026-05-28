/** V3 settings repository. Single doc at `/children/{childId}/settings/current`. */

import { doc, getDoc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { settingsPath } from "@/lib/firestore/paths";
import { v3SettingsConverter } from "../firestore/converters";
import type { Settings } from "../schemas";

function settingsRef(db: Firestore, childId: string) {
  return doc(db, settingsPath(childId)).withConverter(v3SettingsConverter);
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
