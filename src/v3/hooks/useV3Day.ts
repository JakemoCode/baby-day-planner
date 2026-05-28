"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchActiveDay } from "../repositories/days";
import type { Day } from "../schemas";

export type UseV3DayResult = {
  day: Day | null;
  loading: boolean;
};

/** Subscribes to the active day. Converter applies `withV3DayDefaults` on read. */
export function useV3Day(childId: string): UseV3DayResult {
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Stale-callback guard: prevents a late snapshot from a previous childId writing into new state.
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
