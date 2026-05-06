"use client";

import { useEffect, useState } from "react";

function currentLocalMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Returns the current time in minutes-from-day-start (local time).
 * Refreshes every 30 seconds so deltas like "in 12 min" stay accurate
 * without the user perceiving lag.
 */
export function useNowMinutes(): number {
  const [now, setNow] = useState<number>(() => currentLocalMinutes());

  useEffect(() => {
    const id = setInterval(() => setNow(currentLocalMinutes()), 30_000);
    return () => clearInterval(id);
  }, []);

  return now;
}
