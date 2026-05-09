"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { watchActiveDay } from "../repositories/days";
import type { Day } from "../schemas";

export type UseV3DayResult = {
  day: Day | null;
  loading: boolean;
};

export function useV3Day(childId: string): UseV3DayResult {
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return watchActiveDay(db, childId, (d) => {
      setDay(d);
      setLoading(false);
    });
  }, [childId]);

  return { day, loading };
}
