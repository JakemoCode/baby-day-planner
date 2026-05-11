/**
 * R7.x — Bedtime rules.
 *
 * Source: docs/v3/REQUIREMENTS.md §7.
 *
 * The threshold is a *probability shaper* (§0): "after this time, sleep is
 * almost certainly bedtime." It expresses likelihood, not enforcement.
 */

import type { Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, isProjected, projectedEvent } from "../helpers";

const isNap = hasType("nap");
const isBedtime = hasType("bedtime");

/**
 * R7.6 / R7.5 — `bedtimeThreshold` triggers cascade replacement: the first
 * projected nap whose start is at/after the threshold OR whose interval
 * crosses the threshold is replaced by a projected bedtime taking that
 * nap's startTime.
 *
 * R7.11: bedtime takes the substituted nap's startTime exactly.
 *
 * Depends on R3.1 (the cascade must have emitted naps before substitution).
 */
const RuleThresholdBedtime: Rule = {
  id: "R7.6",
  description:
    "Replace the first projected nap whose interval reaches bedtimeThreshold with a projected bedtime",
  dependsOn: ["R3.1"],
  matches: (events, ctx) => {
    if (events.some(isBedtime)) return false;
    return findFirstProjectedNapReachingThreshold(events, ctx.settings.bedtimeThreshold) !== null;
  },
  produces: (events, ctx) => {
    const trigger = findFirstProjectedNapReachingThreshold(events, ctx.settings.bedtimeThreshold);
    if (!trigger) return events;
    const bedtime = projectedEvent({
      ctx,
      id: "proj_bedtime",
      eventKey: "bedtime",
      type: "bedtime",
      kind: "block",
      startTime: trigger.startTime,
      // R7.1: endTime defaults to next morning's defaultWakeTime
      // (24*60 minutes ahead in cross-day notation).
      endTime: ctx.settings.defaultWakeTime + 24 * 60,
      label: "Bedtime",
    });
    return events.filter((e) => e.id !== trigger.id).concat(bedtime);
  },
};

/**
 * A nap "reaches" the threshold if it would start at/after the threshold,
 * OR its interval crosses the threshold (start < threshold < end). Both
 * cases mean: by this point in the day, the next sleep event is most
 * likely bedtime.
 */
function napReachesThreshold(nap: Event, threshold: number): boolean {
  if (nap.startTime >= threshold) return true;
  if (nap.endTime !== undefined && nap.endTime > threshold) return true;
  return false;
}

function findFirstProjectedNapReachingThreshold(events: Event[], threshold: number): Event | null {
  let best: Event | null = null;
  for (const e of events) {
    if (!isNap(e) || !isProjected(e)) continue;
    if (!napReachesThreshold(e, threshold)) continue;
    if (!best || e.startTime < best.startTime) best = e;
  }
  return best;
}

/**
 * R7.4 / R7.4b — Projected naps and wake_windows at/after bedtime drop.
 *
 * R3.1 emits one wake_window + one nap per entry in `wakeWindowsMinutes`
 * up-front, before R7.6 substitutes a nap for bedtime. Whichever indices
 * land past bedtime would otherwise survive (naps as ghost entries,
 * wake_windows pushed into cross-day TimeMin colliding with the bedtime
 * block on the timeline).
 *
 * §0 reality wins: recorded naps after bedtime are kept untouched. Wake
 * windows are always projected (per schema), so reality-wins is moot for
 * them.
 *
 * R7.5 (projected nap crossing bedtime) is naturally subsumed: such a nap
 * is replaced by bedtime via R7.6 (which always picks the FIRST projected
 * nap whose start ≥ threshold).
 */
function dropProjectedAfterBedtime(id: string, isType: (e: Event) => boolean): Rule {
  const isProjectedTypeAfter = (e: Event, threshold: number) =>
    isType(e) && isProjected(e) && e.startTime >= threshold;
  return {
    id,
    description: `Drop projected ${id} events starting at/after the bedtime event`,
    dependsOn: ["R7.6"],
    matches: (events) => {
      const bedtime = events.find(isBedtime);
      if (!bedtime) return false;
      return events.some((e) => isProjectedTypeAfter(e, bedtime.startTime));
    },
    produces: (events) => {
      const bedtime = events.find(isBedtime)!;
      return events.filter((e) => !isProjectedTypeAfter(e, bedtime.startTime));
    },
  };
}

const isWakeWindow = hasType("wake_window");

export const RULES: Rule[] = [
  RuleThresholdBedtime,
  dropProjectedAfterBedtime("R7.4", isNap),
  dropProjectedAfterBedtime("R7.4b", isWakeWindow),
];
