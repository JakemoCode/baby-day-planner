"use client";

import { useEffect, useState } from "react";
import { currentLocalDate } from "../ui/time";

/**
 * Reactive local calendar date (`YYYY-MM-DD`, matching `Day.date`). Re-derives
 * when the wall clock crosses midnight (coarse interval) and immediately when
 * the tab regains focus/visibility — so an app left open overnight rolls to the
 * new day without a manual navigation. Drives day reconcile in useDayPageState.
 */
export function useCurrentLocalDate(): string {
  const [date, setDate] = useState<string>(() => currentLocalDate());

  useEffect(() => {
    const sync = () => setDate(currentLocalDate());
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    const id = setInterval(sync, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return date;
}
