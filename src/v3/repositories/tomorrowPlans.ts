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

import { deleteDoc, doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { tomorrowPlanPath } from "@/lib/firestore/paths";
import { v3TomorrowPlanConverter } from "../firestore/converters";
import type { TomorrowPlan } from "../schemas";

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
