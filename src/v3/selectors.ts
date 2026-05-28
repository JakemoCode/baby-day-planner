/**
 * V3 selectors.
 *
 * Time-aware queries over an `Event[]`. All times are TimeMin (integer
 * minutes since local midnight). String formatting is the renderer's job.
 *
 * Cutover plan: docs/v3/CUTOVER_PLAN.md §PR-A1.
 */

import type { Event, TimeMin } from "./schemas";
import { isRenderSynthetic } from "./lib/syntheticEvents";

/** Stable ascending sort by startTime. Returns a new array. */
function sortByStart(events: Event[]): Event[] {
  return [...events].sort((a, b) => a.startTime - b.startTime);
}

/**
 * Render-synthetic putdowns carry their parent's `type` but `eventKey === PUTDOWN_KIND_TAG`.
 * Selectors must filter them out — a nap-parent putdown otherwise looks like the next nap
 * and its PUTDOWN_KIND_TAG eventKey would be minted as a Firestore doc id (INVALID_ARGUMENT crash).
 */
function isEngineEvent(e: Event): boolean {
  return !isRenderSynthetic(e);
}

/**
 * Returns the next event whose startTime is at or after nowMinutes.
 * The interval is half-open in the future direction: startTime === nowMinutes
 * counts as "next" (not "past").
 */
export function nextEvent(events: Event[], nowMinutes: TimeMin): Event | undefined {
  return sortByStart(events.filter(isEngineEvent)).find((e) => e.startTime >= nowMinutes);
}

/** `nextEvent` filtered to `type === "bottle"`. */
export function nextBottle(events: Event[], nowMinutes: TimeMin): Event | undefined {
  return nextEvent(
    events.filter((e) => e.type === "bottle"),
    nowMinutes,
  );
}

/**
 * Returns the bottle event whose `startTime` is closest to `nowMinutes`
 * (in either direction), within ±`windowMinutes`. Used by the dashboard
 * contextual button's Log Bottle Time window — symmetric around the
 * projected/recorded slot so the user can confirm "yes, that happened"
 * up to `windowMinutes` after the projected time as well as before it.
 */
export function nearestBottleInWindow(
  events: Event[],
  nowMinutes: TimeMin,
  windowMinutes: number,
): Event | undefined {
  let best: Event | undefined;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const e of events) {
    if (e.type !== "bottle") continue;
    if (!isEngineEvent(e)) continue;
    const delta = Math.abs(e.startTime - nowMinutes);
    if (delta > windowMinutes) continue;
    if (delta < bestDelta) {
      best = e;
      bestDelta = delta;
    }
  }
  return best;
}

/** `nextEvent` filtered to `type === "nap"`. */
export function nextNap(events: Event[], nowMinutes: TimeMin): Event | undefined {
  return nextEvent(
    events.filter((e) => e.type === "nap"),
    nowMinutes,
  );
}

/**
 * Returns the wake_window event covering nowMinutes.
 * Interval is half-open: `startTime <= nowMinutes < (endTime ?? Infinity)`.
 * A wake_window without `endTime` is treated as open-ended.
 */
export function currentWakeWindow(events: Event[], nowMinutes: TimeMin): Event | undefined {
  return events.find((e) => {
    if (e.type !== "wake_window") return false;
    if (e.startTime > nowMinutes) return false;
    const end = e.endTime ?? Number.POSITIVE_INFINITY;
    return nowMinutes < end;
  });
}

/**
 * Returns the earliest bedtime event by startTime, or undefined if none exist.
 * Returns the Event itself — V3 keeps everything as TimeMin / Event, never
 * formatted strings.
 */
export function projectedBedtime(events: Event[]): Event | undefined {
  return sortByStart(events.filter((e) => e.type === "bedtime").filter(isEngineEvent))[0];
}
