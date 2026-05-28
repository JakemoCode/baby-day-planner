"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchTomorrowPlan } from "../repositories/tomorrowPlans";
import type { TomorrowPlan } from "../schemas";

export type UseV3TomorrowPlanResult = {
  plan: TomorrowPlan | null;
  loading: boolean;
};

/** Subscribe to a TomorrowPlan by (childId, date). `plan` is null until resolved or when absent. */
export function useV3TomorrowPlan(childId: string, date: string): UseV3TomorrowPlanResult {
  const [plan, setPlan] = useState<TomorrowPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return watchTomorrowPlan(db, childId, date, (p) => {
      setPlan(p);
      setLoading(false);
    });
  }, [childId, date]);

  return { plan, loading };
}
