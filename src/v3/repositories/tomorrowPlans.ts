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
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { tomorrowPlanPath } from "@/lib/firestore/paths";
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
