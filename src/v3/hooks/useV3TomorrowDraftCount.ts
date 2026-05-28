"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchTomorrowDraftCount } from "../repositories/tomorrowPlans";

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
    return watchTomorrowDraftCount(db, childId, setCount);
  }, [childId]);

  return count;
}
