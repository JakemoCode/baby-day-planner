"use client";

import { useEffect, useState } from "react";
import { onSnapshot, type Firestore } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { tomorrowPlanPath } from "@/lib/firestore/paths";
import { doc } from "firebase/firestore";
import { v3TomorrowPlanConverter } from "../firestore/converters";
import type { TomorrowPlan } from "../schemas";

export type UseV3TomorrowPlanResult = {
  plan: TomorrowPlan | null;
  loading: boolean;
};

/**
 * Subscribe to a single `TomorrowPlan` doc by (childId, date).
 *
 * Returns `null` for `plan` until the first snapshot resolves and
 * whenever the doc doesn't exist. `loading` flips to false after the
 * first snapshot regardless of doc existence.
 */
export function useV3TomorrowPlan(childId: string, date: string): UseV3TomorrowPlanResult {
  const [plan, setPlan] = useState<TomorrowPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const database = db as Firestore;
    const ref = doc(database, tomorrowPlanPath(childId, date)).withConverter(
      v3TomorrowPlanConverter,
    );
    return onSnapshot(ref, (snap) => {
      setPlan(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
  }, [childId, date]);

  return { plan, loading };
}
