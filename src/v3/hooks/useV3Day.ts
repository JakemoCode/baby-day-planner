"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { withV3DayDefaults } from "../firestore/dayDefaults";
import { watchActiveDay } from "../repositories/days";
import type { Day } from "../schemas";

export type UseV3DayResult = {
  day: Day | null;
  loading: boolean;
};

/**
 * Subscribes to the active day. The converter already applies
 * `withV3DayDefaults` on read, but we apply it again here as defense
 * in depth — idempotent (defaults-already-present passes through
 * unchanged). Removed once the cutover finishes and only V3-shape
 * day docs remain in Firestore.
 */
export function useV3Day(childId: string): UseV3DayResult {
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return watchActiveDay(db, childId, (d) => {
      setDay(withV3DayDefaults(d));
      setLoading(false);
    });
  }, [childId]);

  return { day, loading };
}
