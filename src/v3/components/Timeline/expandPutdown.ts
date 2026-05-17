/**
 * Putdown is a render-only flag in V3 (R6.1). The engine never emits a
 * putdown event; parent events (nap / bedtime) carry `hasPutdown: true`
 * and the renderer prepends a synthetic block.
 *
 * The synthetic events stay inside the renderer. They share a marker
 * `eventKey` so block geometry / styling can branch on "is this a
 * putdown" without sniffing types.
 */

import type { Event, EventType, TimeMin } from "../../schemas";
import { effectiveEndOf } from "../../lib/effectiveEnd";

export const PUTDOWN_KIND_TAG = "__putdown__";

export type ExpandPutdownOptions = {
  putdownLeadMinutes: TimeMin;
  /**
   * Default nap length in minutes. Used by the R6.8 in-progress overlap
   * check to compute effectiveEndOf for recorded naps.
   */
  defaultNapLengthMinutes: number;
  /**
   * Wall-clock TimeMin. Undefined means "no clock provided, render
   * every hasPutdown event" — the read-only archived-day path.
   */
  nowMinutes?: TimeMin;
};

export function expandPutdownBlocks(events: Event[], options: ExpandPutdownOptions): Event[] {
  const { putdownLeadMinutes, defaultNapLengthMinutes, nowMinutes } = options;
  const now = nowMinutes;
  // In-progress sleeps are identified time-based (not by `started` state).
  const inProgressSleeps =
    now !== undefined
      ? events.filter((e) => isInProgressSleep(e, defaultNapLengthMinutes, now))
      : [];
  const out: Event[] = [];
  for (const e of events) {
    out.push(e);
    if (
      e.hasPutdown &&
      isStillFuture(e, now) &&
      !windowOverlapsInProgressSleep(
        inProgressSleeps,
        e.startTime - putdownLeadMinutes,
        e.startTime,
        defaultNapLengthMinutes,
        now ?? 0,
      )
    ) {
      out.push(syntheticPutdown(e, putdownLeadMinutes));
    }
  }
  return out;
}

// R6.7 — suppress the synthetic putdown when the parent's moment has
// passed. `nowMinutes` undefined means "no clock provided, render every
// hasPutdown event" — that's the read-only archived-day path.
function isStillFuture(parent: Event, nowMinutes: TimeMin | undefined): boolean {
  if (nowMinutes === undefined) return true;
  return parent.startTime > nowMinutes;
}

// R6.8 — suppress a putdown chip whose window overlaps any in-progress
// sleep block. "In progress" is a time property: lifecycle.state === "recorded"
// AND startTime <= now AND now < effectiveEnd.
function isInProgressSleep(e: Event, napLen: number, now: TimeMin): boolean {
  if (e.type !== "nap" && e.type !== "bedtime") return false;
  if (e.lifecycle.state !== "recorded") return false;
  if (e.startTime > now) return false;
  return now < effectiveEndOf(e, napLen, now);
}

function windowOverlapsInProgressSleep(
  inProgressSleeps: Event[],
  windowStart: TimeMin,
  windowEnd: TimeMin,
  napLen: number,
  now: TimeMin,
): boolean {
  return inProgressSleeps.some((s) => {
    const sStart = s.startTime;
    const sEnd = effectiveEndOf(s, napLen, now);
    return windowStart < sEnd && windowEnd > sStart;
  });
}

function syntheticPutdown(parent: Event, lead: TimeMin): Event {
  // Use the parent's type so block geometry rules can stay typed; the
  // PUTDOWN_KIND_TAG eventKey is what the timeline branches on for
  // putdown-specific rendering.
  const type: EventType = parent.type;
  const synthetic: Event = {
    id: `putdown:${parent.id}`,
    dayId: parent.dayId,
    eventKey: PUTDOWN_KIND_TAG,
    type,
    kind: "block",
    startTime: parent.startTime - lead,
    endTime: parent.startTime,
    label: "Putdown",
    hasPutdown: false,
    lifecycle: parent.lifecycle,
    ...(parent.owner !== undefined ? { owner: parent.owner } : {}),
  };
  return synthetic;
}
