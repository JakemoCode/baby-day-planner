/**
 * Putdown is render-only (R6.1). Parent events carry `hasPutdown: true`;
 * synthetic blocks share PUTDOWN_KIND_TAG so geometry can branch without sniffing types.
 */

import type { Event, EventType, TimeMin } from "../../schemas";
import { resolvedEnd, isInProgress, type EffectiveEndConfig } from "../../lib/effectiveEnd";
import { PUTDOWN_KIND_TAG } from "../../lib/syntheticEvents";

export { PUTDOWN_KIND_TAG };

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
  // EffectiveEndConfig = Pick<Settings, "defaultNapLengthMinutes">; object literal satisfies structurally.
  const napConfig: EffectiveEndConfig = { defaultNapLengthMinutes };
  // In-progress identified time-based. Empty when nowMinutes is undefined (archived-day path).
  const inProgressSleeps =
    nowMinutes !== undefined
      ? events.filter((e) => isInProgressSleep(e, napConfig, nowMinutes))
      : [];
  const out: Event[] = [];
  for (const e of events) {
    out.push(e);
    if (
      e.hasPutdown &&
      isStillFuture(e, nowMinutes) &&
      !windowOverlapsInProgressSleep(
        inProgressSleeps,
        e.startTime - putdownLeadMinutes,
        e.startTime,
        napConfig,
        nowMinutes,
      )
    ) {
      out.push(syntheticPutdown(e, putdownLeadMinutes));
    }
  }
  return out;
}

// R6.7: suppress when the parent's moment has passed. Undefined = archived-day (always render).
function isStillFuture(parent: Event, nowMinutes: TimeMin | undefined): boolean {
  if (nowMinutes === undefined) return true;
  return parent.startTime > nowMinutes;
}

// R6.8: suppress when the putdown window overlaps any in-progress sleep.
function isInProgressSleep(e: Event, config: EffectiveEndConfig, now: TimeMin): boolean {
  return (e.type === "nap" || e.type === "bedtime") && isInProgress(e, config, now);
}

function windowOverlapsInProgressSleep(
  inProgressSleeps: Event[],
  windowStart: TimeMin,
  windowEnd: TimeMin,
  config: EffectiveEndConfig,
  now: TimeMin | undefined,
): boolean {
  // nowMinutes undefined → inProgressSleeps is already []; .some is a no-op.
  if (inProgressSleeps.length === 0 || now === undefined) return false;
  return inProgressSleeps.some((s) => {
    const sStart = s.startTime;
    const sEnd = resolvedEnd(s, config, now);
    return windowStart < sEnd && windowEnd > sStart;
  });
}

function syntheticPutdown(parent: Event, lead: TimeMin): Event {
  // Parent type preserved so geometry rules stay typed; PUTDOWN_KIND_TAG eventKey drives render branching.
  const type: EventType = parent.type;
  // owner required.
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
    owner: parent.owner,
  };
  return synthetic;
}
