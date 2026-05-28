/**
 * V3 TomorrowPlan repository. One doc per (childId, date).
 * Materialized on first user edit only (never on page idle).
 */

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { tomorrowPlanPath, tomorrowPlansCollectionPath } from "@/lib/firestore/paths";
import { v3TomorrowPlanConverter } from "../firestore/converters";
import type { TimeMin, TomorrowPlan } from "../schemas";

function planRef(db: Firestore, childId: string, date: string) {
  return doc(db, tomorrowPlanPath(childId, date)).withConverter(v3TomorrowPlanConverter);
}

export async function loadTomorrowPlan(
  db: Firestore,
  childId: string,
  date: string,
): Promise<TomorrowPlan | null> {
  const snap = await getDoc(planRef(db, childId, date));
  return snap.exists() ? snap.data() : null;
}

/** Subscribe to a single TomorrowPlan by (childId, date); delivers null when absent. */
export function watchTomorrowPlan(
  db: Firestore,
  childId: string,
  date: string,
  cb: (plan: TomorrowPlan | null) => void,
): () => void {
  return onSnapshot(planRef(db, childId, date), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  });
}

/** Subscribe to the count of draft TomorrowPlan docs; reports 0 on error. */
export function watchTomorrowDraftCount(
  db: Firestore,
  childId: string,
  cb: (count: number) => void,
): () => void {
  const plansRef = collection(db, tomorrowPlansCollectionPath(childId)).withConverter(
    v3TomorrowPlanConverter,
  );
  const draftsQuery = query(plansRef, where("status", "==", "draft"));
  return onSnapshot(
    draftsQuery,
    (snap) => cb(snap.size),
    (err) => {
      console.error("[watchTomorrowDraftCount] subscription error", err);
      cb(0);
    },
  );
}

export async function saveTomorrowPlan(
  db: Firestore,
  childId: string,
  plan: TomorrowPlan,
): Promise<void> {
  await setDoc(planRef(db, childId, plan.date), plan);
}

export async function deleteTomorrowPlan(
  db: Firestore,
  childId: string,
  date: string,
): Promise<void> {
  await deleteDoc(planRef(db, childId, date));
}

/**
 * Flip an existing plan to `confirmed` and stamp `confirmedAt`.
 * Throws if the doc doesn't exist — callers must have autosaved a draft first.
 */
export async function confirmTomorrowPlan(
  db: Firestore,
  childId: string,
  date: string,
  confirmedAt: TimeMin,
): Promise<void> {
  await updateDoc(planRef(db, childId, date), { status: "confirmed", confirmedAt });
}

/** Revert a plan to `draft` and clear `confirmedAt`. */
export async function markPlanDraft(db: Firestore, childId: string, date: string): Promise<void> {
  // deleteField removes confirmedAt entirely — avoids storing null, which violates the `?: TimeMin` schema contract.
  await updateDoc(planRef(db, childId, date), {
    status: "draft",
    confirmedAt: deleteField(),
  });
}

/**
 * Delete TomorrowPlan docs whose `date` is before `today`. Best-effort;
 * caller logs failures. Plans past their date can never auto-promote.
 */
export async function deleteStaleTomorrowPlans(
  db: Firestore,
  childId: string,
  today: string,
): Promise<number> {
  const plansRef = collection(db, tomorrowPlansCollectionPath(childId)).withConverter(
    v3TomorrowPlanConverter,
  );
  const staleQuery = query(plansRef, where("date", "<", today));
  const snap = await getDocs(staleQuery);
  if (snap.empty) return 0;
  const batch = writeBatch(db);
  for (const d of snap.docs) {
    batch.delete(d.ref);
  }
  await batch.commit();
  return snap.size;
}
