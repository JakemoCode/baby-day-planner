"use client";

import { useEffect, useState } from "react";
import type { Day } from "@/domain";
import { db } from "@/lib/firebase/client";
import { watchActiveDay } from "@/repositories/days";
import { withV2DayBackcompat } from "@/v3/firestore/v2Backcompat";

export type UseDayResult = {
  day: Day | null;
  loading: boolean;
};

export function useDay(childId: string): UseDayResult {
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return watchActiveDay(db, childId, (d) => {
      setDay(withV2DayBackcompat(d));
      setLoading(false);
    });
  }, [childId]);

  return { day, loading };
}
