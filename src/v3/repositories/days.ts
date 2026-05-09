/**
 * V3 days repository.
 *
 * Path-compatible with V2 (`children/{childId}/days/{dayId}`). Wire
 * shape: V3 Day has TimeMin `wakeTime` (number, optional) plus
 * `suppressedRecurringIds` and `suppressedDaycareDay`.
 *
 * `archiveDay` does NOT carry an `archivedAt` like V2. The engine
 * doesn't read it, and `Day.date` already gives chronological history
 * sort. If a future feature needs it, extend the V3 Day type and the
 * archive call together.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { dayPath, daysCollectionPath } from "@/lib/firestore/paths";
import { v3DayConverter } from "../firestore/converters";
import type { Day } from "../schemas";

function dayRef(db: Firestore, childId: string, dayId: string) {
  return doc(db, dayPath(childId, dayId)).withConverter(v3DayConverter);
}

function daysRef(db: Firestore, childId: string) {
  return collection(db, daysCollectionPath(childId)).withConverter(v3DayConverter);
}

export async function createDay(db: Firestore, day: Day): Promise<void> {
  await setDoc(dayRef(db, day.childId, day.id), day);
}

export async function getDay(db: Firestore, childId: string, dayId: string): Promise<Day | null> {
  const snap = await getDoc(dayRef(db, childId, dayId));
  return snap.exists() ? snap.data() : null;
}

export async function getDayByDate(
  db: Firestore,
  childId: string,
  date: string,
): Promise<Day | null> {
  const q = query(daysRef(db, childId), where("date", "==", date), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0]!.data();
}

export async function archiveDay(db: Firestore, childId: string, dayId: string): Promise<void> {
  await updateDoc(dayRef(db, childId, dayId), { status: "archived" });
}

export async function updateDay(
  db: Firestore,
  childId: string,
  dayId: string,
  patch: Partial<Day>,
): Promise<void> {
  await updateDoc(dayRef(db, childId, dayId), patch);
}

export async function listArchivedDays(db: Firestore, childId: string, max = 7): Promise<Day[]> {
  const q = query(
    daysRef(db, childId),
    where("status", "==", "archived"),
    orderBy("date", "desc"),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export function watchActiveDay(
  db: Firestore,
  childId: string,
  cb: (day: Day | null) => void,
): () => void {
  const q = query(daysRef(db, childId), where("status", "==", "active"), limit(1));
  return onSnapshot(q, (snap) => {
    cb(snap.empty ? null : snap.docs[0]!.data());
  });
}
