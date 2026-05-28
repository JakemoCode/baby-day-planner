"use client";

/**
 * Per-day "delete" → suppression routing for the drawer.
 *
 * The drawer's onDelete handler walks this list and invokes the
 * matching `apply` to write a per-day suppression flag rather than
 * actually deleting from a shared template. Dashboard and timeline
 * pages both need the same routing, so the array lives here.
 *
 * Returns `[]` when there's no active day — the drawer's delete path
 * then falls through to the default behavior (true deletion of an
 * `actuals` doc).
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
