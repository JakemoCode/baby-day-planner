"use client";

/**
 * Per-day delete → suppression routing for the drawer. Writes a per-day
 * suppression flag instead of deleting from a shared template. Returns `[]`
 * when there's no active day, letting the drawer fall through to true deletion.
 */

import type { Firestore } from "firebase/firestore";
import type { DrawerSuppression } from "./useDrawer";
import {
  suppressDaycareForDay,
  suppressDreamFeedForDay,
  suppressRecurringForDay,
} from "../repositories/days";
import {
  DAYCARE_DROPOFF_EVENT_KEY,
  DAYCARE_PICKUP_EVENT_KEY,
  DREAM_FEED_EVENT_KEY,
  recurringIdFromEventKey,
} from "../lib/eventConventions";

export function useDayDrawerSuppressions(
  db: Firestore,
  childId: string,
  dayId: string | undefined,
): DrawerSuppression[] {
  if (!dayId) return [];
  return [
    {
      matches: (e) => e.type === "daily_recurring",
      apply: (e) =>
        suppressRecurringForDay(db, childId, dayId, recurringIdFromEventKey(e.eventKey)),
    },
    {
      matches: (e) => e.type === DAYCARE_DROPOFF_EVENT_KEY || e.type === DAYCARE_PICKUP_EVENT_KEY,
      apply: () => suppressDaycareForDay(db, childId, dayId),
    },
    {
      matches: (e) => e.type === "bottle" && e.eventKey === DREAM_FEED_EVENT_KEY,
      apply: () => suppressDreamFeedForDay(db, childId, dayId),
    },
  ];
}
