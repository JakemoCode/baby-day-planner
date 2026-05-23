/**
 * Pure data helpers for the dashboard panels.
 *
 * Lives outside any component so the panels stay declarative and the
 * "skip in-progress" rule has one home. All inputs are TimeMin; all
 * outputs are plain numbers / Events.
 */

import type { Event, TimeMin } from "@/v3/schemas";
import { isRecorded } from "@/v3/schemas";
import { isRenderSynthetic } from "@/v3/lib/syntheticEvents";

const DASHBOARD_NEXT_TYPES = new Set<Event["type"]>(["bottle", "nap", "bedtime"]);

export function bottleTotals(events: Event[]): { count: number; oz: number } {
  let count = 0;
  let oz = 0;
  for (const e of events) {
    if (e.type !== "bottle") continue;
    if (!isRecorded(e.lifecycle)) continue;
    count += 1;
    oz += e.amountOz ?? 0;
  }
  return { count, oz };
}

export function napTotals(events: Event[]): { count: number; totalMinutes: number } {
  let count = 0;
  let totalMinutes = 0;
  for (const e of events) {
    if (e.type !== "nap") continue;
    if (!isRecorded(e.lifecycle)) continue;
    if (e.endTime === undefined) continue;
    count += 1;
    totalMinutes += e.endTime - e.startTime;
  }
  return { count, totalMinutes };
}

export function lastBottle(events: Event[]): Event | undefined {
  let best: Event | undefined;
  for (const e of events) {
    if (e.type !== "bottle") continue;
    if (!isRecorded(e.lifecycle)) continue;
    if (!best || e.startTime > best.startTime) best = e;
  }
  return best;
}

export function lastCompletedNap(events: Event[], now: TimeMin): Event | undefined {
  let best: Event | undefined;
  for (const e of events) {
    if (e.type !== "nap") continue;
    if (!isRecorded(e.lifecycle)) continue;
    if (e.endTime === undefined) continue;
    // §F48: a recorded nap whose endTime was back-edited to a future
    // value isn't "completed" from the user's POV — without this
    // filter the dashboard rendered `"45m, 0 min ago (4:02p)"` at
    // 2:30pm because Math.max(0, now - future) clamps the negative
    // delta to "0 min ago" while the clock string still printed the
    // future endTime. Future-end naps are excluded from "Last nap".
    if (e.endTime > now) continue;
    if (!best || (best.endTime !== undefined && e.endTime > best.endTime)) best = e;
  }
  return best;
}

/**
 * Next bottle/nap/bedtime at or after `now`. Skips:
 *   - synthetic putdown render-blocks (eventKey === PUTDOWN_KIND_TAG)
 *     which carry their parent's type but aren't standalone engine
 *     events — the parent nap/bedtime is the real "next"
 *   - any nap or bedtime currently in progress (startTime ≤ now <
 *     endTime); NowBanner already announces it
 */
export function nextDashboardEvent(events: Event[], now: TimeMin): Event | undefined {
  const sorted = [...events].sort((a, b) => a.startTime - b.startTime);
  for (const e of sorted) {
    if (isRenderSynthetic(e)) continue;
    if (!DASHBOARD_NEXT_TYPES.has(e.type)) continue;
    if (
      (e.type === "nap" || e.type === "bedtime") &&
      e.startTime <= now &&
      e.endTime !== undefined &&
      now < e.endTime
    ) {
      continue;
    }
    if (e.startTime >= now) return e;
  }
  return undefined;
}
