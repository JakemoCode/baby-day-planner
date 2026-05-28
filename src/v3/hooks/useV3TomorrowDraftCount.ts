"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchTomorrowDraftCount } from "../repositories/tomorrowPlans";

/**
 * Count of draft TomorrowPlan docs — drives the Tomorrow tab notification dot.
 * Only drafts dot; confirmed plans are dot-free. Stale plans GC'd on rollover.
 */
export function useV3TomorrowDraftCount(childId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    return watchTomorrowDraftCount(db, childId, setCount);
  }, [childId]);

  return count;
}
