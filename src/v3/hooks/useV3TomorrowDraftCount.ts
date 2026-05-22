"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, type Firestore } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { tomorrowPlansCollectionPath } from "@/lib/firestore/paths";
import { v3TomorrowPlanConverter } from "../firestore/converters";

/**
 * Count of unconfirmed (`status === "draft"`) TomorrowPlan docs for
 * this child. Used by the Tomorrow bottom-nav tab to render a
 * notification dot indicating "you have an unfinished plan."
 *
 * Per scope §6 + §7: only drafts dot the tab. Confirmed plans are
 * dot-free (they're "settled" — they will auto-apply). Stale plans
 * (`date < today`) get GC'd during rollover, so they don't accumulate.
 */
export function useV3TomorrowDraftCount(childId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const database = db as Firestore;
    const plansRef = collection(database, tomorrowPlansCollectionPath(childId)).withConverter(
      v3TomorrowPlanConverter,
    );
    const draftsQuery = query(plansRef, where("status", "==", "draft"));
    return onSnapshot(
      draftsQuery,
      (snap) => setCount(snap.size),
      (err) => {
        console.error("[useV3TomorrowDraftCount] subscription error", err);
        setCount(0);
      },
    );
  }, [childId]);

  return count;
}
