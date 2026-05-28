"use client";

import { useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
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
  // Capture defaultWakeTime in a ref so the effect's deps stay
  // `[childId, today]`. Without this, settings loading async after
  // first render (e.g. `settings?.defaultWakeTime ?? FALLBACK`) flips
  // the value once and re-fires the entire reconcile — the second
  // promote would overwrite the first with the new wake time.
  // Idempotent setDoc keeps the doc consistent but the side-effects
  // double-fire. The ref keeps the LATEST value visible to the async
  // work without retriggering it. Assignment in a no-dep effect (not
  // during render) per react-hooks/rules-of-hooks.
  const wakeTimeRef = useRef(defaultWakeTime);
  useEffect(() => {
    wakeTimeRef.current = defaultWakeTime;
  });

  useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const daysRef = collection(db, daysCollectionPath(childId)).withConverter(v3DayConverter);
      const activeQuery = query(daysRef, where("status", "==", "active"), limit(1));
      const activeSnap = await getDocs(activeQuery);
      const active = activeSnap.empty ? null : activeSnap.docs[0]!.data();

      // Best-effort: GC any plans whose date has already passed. Runs
      // alongside the active-day check so stale state never accumulates.
      // Errors here don't block promote — they just leave shadow docs
      // that the next reconcile will catch.
      deleteStaleTomorrowPlans(db, childId, today).catch((err) => {
        console.error("[useReconcileActiveDay] stale-plan GC failed", err);
      });

      if (active && active.date === today) {
        if (!cancelled) setDone(true);
        return;
      }

      // Active is stale or missing. Look for a confirmed plan for today;
      // fall back to settings defaults.
      const plan = await loadTomorrowPlan(db, childId, today);
      if (plan?.status === "confirmed") {
        await promoteFromPlan(db, childId, plan, wakeTimeRef.current);
      } else {
        await startNewDay(db, childId, {
          newDate: today,
          newWakeTime: wakeTimeRef.current,
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
  }, [childId, today]);

  return error !== undefined ? { done, error } : { done };
}
