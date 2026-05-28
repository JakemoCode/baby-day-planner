/** Pure data helpers for dashboard panels; all inputs TimeMin, all outputs plain numbers/Events. */

import type { Event, TimeMin } from "@/v3/schemas";
import { isRecorded } from "@/v3/schemas";
import { isRenderSynthetic } from "@/v3/lib/syntheticEvents";

const DASHBOARD_NEXT_TYPES = new Set<Event["type"]>(["bottle", "nap", "bedtime"]);

// Filter out recorded events back-edited to a future time (prevents "0 min ago" on future times).
export function bottleTotals(events: Event[], now: TimeMin): { count: number; oz: number } {
  let count = 0;
  let oz = 0;
  for (const e of events) {
    if (e.type !== "bottle") continue;
    if (!isRecorded(e.lifecycle)) continue;
    if (e.startTime > now) continue;
    count += 1;
    oz += e.amountOz ?? 0;
  }
  return { count, oz };
}

export function napTotals(events: Event[], now: TimeMin): { count: number; totalMinutes: number } {
  let count = 0;
  let totalMinutes = 0;
  for (const e of events) {
    if (e.type !== "nap") continue;
    if (!isRecorded(e.lifecycle)) continue;
    if (e.endTime === undefined) continue;
    // Skip back-edited future naps.
    if (e.startTime > now) continue;
    // In-progress nap contributes elapsed time only, not placeholder duration.
    const effectiveEnd = e.endTime > now ? now : e.endTime;
    count += 1;
    totalMinutes += effectiveEnd - e.startTime;
  }
  return { count, totalMinutes };
}

export function lastBottle(events: Event[], now: TimeMin): Event | undefined {
  let best: Event | undefined;
  for (const e of events) {
    if (e.type !== "bottle") continue;
    if (!isRecorded(e.lifecycle)) continue;
    if (e.startTime > now) continue;
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
    // Exclude naps back-edited to a future endTime (prevents "0 min ago" with future clock string).
    if (e.endTime > now) continue;
    if (!best || (best.endTime !== undefined && e.endTime > best.endTime)) best = e;
  }
  return best;
}

/** Next bottle/nap/bedtime at or after now; skips synthetics and in-progress sleep already shown by NowBanner. */
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
