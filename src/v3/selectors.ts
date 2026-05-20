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
 * Render-synthetic putdown events carry their parent's `type` (so the
 * timeline geometry can stay typed) but `eventKey === PUTDOWN_KIND_TAG`.
 * Selectors operating on "engine events" must ignore them — otherwise a
 * synthetic putdown with `type === "nap"` looks like the next nap and
 * gets routed to e.g. `nextProjectedNap.eventKey`. (Caused a Firestore
 * INVALID_ARGUMENT crash on Start Nap Now when its id was minted from
 * the putdown's PUTDOWN_KIND_TAG eventKey.)
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
