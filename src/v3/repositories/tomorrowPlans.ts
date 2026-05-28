/**
 * V3 TomorrowPlan repository.
 *
 * One doc per (childId, date) at `children/{childId}/tomorrowPlans/{date}`.
 * The doc is only written when the user actually edits something on
 * `/tomorrow` (§F39 lock: materialize on first edit, never on page idle).
 *
 * Auto-promote happens elsewhere — the engine consumes this doc when the
 * first wake event is recorded for `date`.
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

/**
 * Subscribe to a single `TomorrowPlan` doc by (childId, date). Delivers
 * `null` when the doc doesn't exist. Mirrors `watchActiveDay` /
 * `watchSettings` so the hook layer never builds Firestore refs itself.
 */
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

/**
 * Subscribe to the count of unconfirmed (`status === "draft"`)
 * TomorrowPlan docs for this child. On subscription error, logs and
 * reports 0 (the Tomorrow tab's dot just disappears rather than
 * sticking on a stale count).
 */
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
 * Caller supplies the TimeMin in local-day frame (use
 * `currentLocalMinutes()` in app code). Throws if the doc doesn't
 * exist — call sites must have autosaved a draft first.
 */
export async function confirmTomorrowPlan(
  db: Firestore,
  childId: string,
  date: string,
  confirmedAt: TimeMin,
): Promise<void> {
  await updateDoc(planRef(db, childId, date), { status: "confirmed", confirmedAt });
}

/**
 * Revert a plan to `draft` and clear `confirmedAt`. Called whenever
 * the user edits a confirmed plan — they must explicitly re-confirm
 * to keep auto-promote eligibility.
 */
export async function markPlanDraft(db: Firestore, childId: string, date: string): Promise<void> {
  // Use deleteField for confirmedAt so the doc matches the schema
  // (TimeMin | undefined) instead of storing a stray null that would
  // surface to engine consumers as `confirmedAt = null` and break the
  // `?: TimeMin` contract.
  await updateDoc(planRef(db, childId, date), {
    status: "draft",
    confirmedAt: deleteField(),
  });
}

/**
 * Garbage-collect any TomorrowPlan docs whose `date` is strictly less
 * than `today`. Called during calendar-rollover reconciliation (§F17
 * scope §6) — once a plan's date has passed without being promoted,
 * it can never auto-promote again, so keeping it around just creates
 * stale state that surfaces in /tomorrow read paths.
 *
 * Best-effort: failures are swallowed at the caller (the hook logs).
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
