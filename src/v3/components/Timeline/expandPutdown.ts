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

export const PUTDOWN_KIND_TAG = "__putdown__";

export type ExpandPutdownOptions = {
  putdownLeadMinutes: TimeMin;
  /**
   * Soft-end for started naps with no recorded endTime. Used by the
   * R6.8 in-progress overlap check. NOTE: also used for in-progress
   * BEDTIME blocks today, where the right soft-end would be
   * `nextDayAt(defaultWakeTime)`. The cascade doesn't project any
   * putdown-eligible events after bedtime starts, so the mismatch
   * isn't observable — but if a future change emits putdowns past
   * bedtime, this becomes a real bug. Worth a dedicated soft-end
   * helper at that point.
   */
  defaultNapLengthMinutes: TimeMin;
  /**
   * Wall-clock TimeMin. Undefined means "no clock provided, render
   * every hasPutdown event" — the read-only archived-day path.
   */
  nowMinutes?: TimeMin;
};

export function expandPutdownBlocks(events: Event[], options: ExpandPutdownOptions): Event[] {
  const { putdownLeadMinutes, defaultNapLengthMinutes, nowMinutes } = options;
  const startedSleeps = events.filter(isInProgressSleep);
  const out: Event[] = [];
  for (const e of events) {
    out.push(e);
    if (
      e.hasPutdown &&
      isStillFuture(e, nowMinutes) &&
      !windowOverlapsInProgressSleep(
        startedSleeps,
        e.startTime - putdownLeadMinutes,
        e.startTime,
        defaultNapLengthMinutes,
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
// sleep block (started, no endTime). Once the user is already asleep,
// the wind-down chip for the NEXT sleep is irrelevant and confusing.
function isInProgressSleep(e: Event): boolean {
  return (e.type === "nap" || e.type === "bedtime") && e.lifecycle.state === "started";
}

function windowOverlapsInProgressSleep(
  startedSleeps: Event[],
  windowStart: TimeMin,
  windowEnd: TimeMin,
  defaultNapLengthMinutes: TimeMin,
): boolean {
  return startedSleeps.some((s) => {
    const sStart = s.startTime;
    const sEnd = s.endTime ?? s.startTime + defaultNapLengthMinutes;
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
