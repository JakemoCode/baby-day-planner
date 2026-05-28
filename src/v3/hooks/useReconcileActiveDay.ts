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
 * On mount, reconciles the active day with today. Promotes from a confirmed
 * TomorrowPlan if one exists, otherwise uses settings defaults. Deterministic
 * day id makes concurrent calls idempotent.
 */
export function useReconcileActiveDay(
  childId: string,
  today: string,
  defaultWakeTime: TimeMin,
): UseReconcileActiveDayResult {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  // Ref keeps the latest defaultWakeTime available to the effect without adding it
  // as a dep — settings loading async would otherwise re-fire the reconcile a second time.
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

      // Best-effort GC of past plans; errors leave shadow docs for the next reconcile.
      deleteStaleTomorrowPlans(db, childId, today).catch((err) => {
        console.error("[useReconcileActiveDay] stale-plan GC failed", err);
      });

      if (active && active.date === today) {
        if (!cancelled) setDone(true);
        return;
      }

      // Active day is stale or missing; promote from confirmed plan or settings defaults.
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
