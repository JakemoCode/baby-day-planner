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
    if (events.some((e) => e.type === "bedtime")) return false;
    return events.some(
      (e) =>
        e.type === "nap" &&
        e.lifecycle.state === "projected" &&
        napReachesThreshold(e, ctx.settings.bedtimeThreshold),
    );
  },
  produces: (events, ctx) => {
    const trigger = findFirstProjectedNapReachingThreshold(events, ctx.settings.bedtimeThreshold);
    if (!trigger) return events;
    const bedtime: Event = {
      id: "proj_bedtime",
      dayId: ctx.day.id,
      eventKey: "bedtime",
      type: "bedtime",
      kind: "block",
      startTime: trigger.startTime,
      // R7.1: endTime defaults to next morning's defaultWakeTime
      // (24*60 minutes ahead in cross-day notation).
      endTime: ctx.settings.defaultWakeTime + 24 * 60,
      label: "Bedtime",
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
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

function findFirstProjectedNapReachingThreshold(
  events: Event[],
  threshold: number,
): Event | undefined {
  let best: Event | undefined;
  for (const e of events) {
    if (e.type !== "nap") continue;
    if (e.lifecycle.state !== "projected") continue;
    if (!napReachesThreshold(e, threshold)) continue;
    if (!best || e.startTime < best.startTime) best = e;
  }
  return best;
}

/**
 * R7.4 — Projected naps starting at/after the bedtime event are removed.
 *
 * §0 reality wins: recorded naps after bedtime are kept untouched. The
 * evaluator's reality-wins guard would throw if this rule tried to drop one.
 *
 * R7.5 (projected nap crossing bedtime) is naturally subsumed: such a nap
 * is replaced by bedtime via R7.6 (which always picks the FIRST projected
 * nap whose start ≥ threshold), and any later naps caught here.
 */
const RuleDropProjectedNapsAfterBedtime: Rule = {
  id: "R7.4",
  description: "Drop projected naps starting at/after a bedtime event (recorded naps stand)",
  dependsOn: ["R7.6"],
  matches: (events) => {
    const bedtime = events.find((e) => e.type === "bedtime");
    if (!bedtime) return false;
    return events.some(
      (e) =>
        e.type === "nap" && e.lifecycle.state === "projected" && e.startTime >= bedtime.startTime,
    );
  },
  produces: (events) => {
    const bedtime = events.find((e) => e.type === "bedtime")!;
    return events.filter(
      (e) =>
        !(
          e.type === "nap" &&
          e.lifecycle.state === "projected" &&
          e.startTime >= bedtime.startTime
        ),
    );
  },
};

export const RULES: Rule[] = [RuleThresholdBedtime, RuleDropProjectedNapsAfterBedtime];
