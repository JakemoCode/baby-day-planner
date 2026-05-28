"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchActiveDay } from "../repositories/days";
import type { Day } from "../schemas";

export type UseV3DayResult = {
  day: Day | null;
  loading: boolean;
};

/**
 * Subscribes to the active day. The converter applies `withV3DayDefaults`
 * on read so this hook just forwards the result.
 */
export function useV3Day(childId: string): UseV3DayResult {
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Stale-callback guard — see useV3User for the rationale. Without
    // it, a late snapshot from the previous childId can write that
    // child's day into the new child's state on child-switch.
    let active = true;
    const unsub = watchActiveDay(db, childId, (d) => {
      if (!active) return;
      setDay(d);
      setLoading(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [childId]);

  return { day, loading };
}
