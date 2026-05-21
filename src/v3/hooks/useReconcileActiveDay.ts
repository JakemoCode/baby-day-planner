"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, limit, query, where, type Firestore } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { daysCollectionPath } from "@/lib/firestore/paths";
import { v3DayConverter } from "../firestore/converters";
import { promoteFromPlan, startNewDay } from "../repositories/days";
import { deleteStaleTomorrowPlans, loadTomorrowPlan } from "../repositories/tomorrowPlans";
import type { TimeMin } from "../schemas";

export type UseReconcileActiveDayResult = {
  /** True once the reconcile pass has completed (or errored — see error). */
  done: boolean;
  /** Last error, if any. */
  error?: Error;
};

/**
 * §F17 — bring the active day in sync with the calendar.
 *
 * On mount:
 *   1. Reads the current active day (one-shot query)
 *   2. If `active.date === today` → no-op
 *   3. Else: promotes today (from confirmed TomorrowPlan if any, else
 *      settings defaults) and archives the prior active day in the
 *      process (inherited from `startNewDay`)
 *
 * Uses a deterministic Day id (`day-${childId}-${date}`) so concurrent
 * parent-opens at the date boundary land on the same doc (idempotent
 * setDoc).
 */
export function useReconcileActiveDay(
  childId: string,
  today: string,
  defaultWakeTime: TimeMin,
): UseReconcileActiveDayResult {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const database = db as Firestore;
      const daysRef = collection(database, daysCollectionPath(childId)).withConverter(
        v3DayConverter,
      );
      const activeQuery = query(daysRef, where("status", "==", "active"), limit(1));
      const activeSnap = await getDocs(activeQuery);
      const active = activeSnap.empty ? null : activeSnap.docs[0]!.data();

      // Best-effort: GC any plans whose date has already passed. Runs
      // alongside the active-day check so stale state never accumulates.
      // Errors here don't block promote — they just leave shadow docs
      // that the next reconcile will catch.
      deleteStaleTomorrowPlans(database, childId, today).catch((err) => {
        console.error("[useReconcileActiveDay] stale-plan GC failed", err);
      });

      if (active && active.date === today) {
        if (!cancelled) setDone(true);
        return;
      }

      // Active is stale or missing. Look for a confirmed plan for today;
      // fall back to settings defaults.
      const plan = await loadTomorrowPlan(database, childId, today);
      if (plan?.status === "confirmed") {
        await promoteFromPlan(database, childId, plan, defaultWakeTime);
      } else {
        await startNewDay(database, childId, {
          newDate: today,
          newWakeTime: defaultWakeTime,
        });
      }

      if (!cancelled) setDone(true);
    }

    reconcile().catch((err) => {
      console.error("[useReconcileActiveDay] failed", err);
      if (!cancelled) {
        setError(err as Error);
        setDone(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [childId, today, defaultWakeTime]);

  return error !== undefined ? { done, error } : { done };
}
