/**
 * R5.x — Bottle rules.
 *
 * Source: docs/v3/REQUIREMENTS.md §5.
 */

import { isRecorded, type Context, type Event } from "../../schemas";
import type { Rule } from "../evaluator";

/**
 * R5.11 — Project bottle placeholders up to settings.bottleChain.bottlesPerDay.
 *
 * Anchoring (per the resolved R5.10/R5.11 spec):
 * - With zero recorded bottles, the first placeholder lands at
 *   `Day.wakeTime + bottleChain.bufferAfterWakeMinutes`. Subsequent
 *   placeholders cascade at `defaultBottleIntervalMinutes` until
 *   `bottlesPerDay` total exist.
 * - With one or more recorded bottles, R5.1 takes over: cascade resumes
 *   from the latest recorded bottle's startTime. (Implemented in a
 *   subsequent rule.)
 *
 * Recorded bottles are never touched. The reality-wins guard would
 * throw if this rule mutated one.
 */
const RuleProjectBottlePlaceholders: Rule = {
  id: "R5.11",
  description:
    "Project bottle placeholders up to bottlesPerDay, anchored at wake + buffer when no recordings yet",
  matches: (events, ctx) => {
    if (ctx.day.wakeTime === undefined) return false;
    const bottlesProjected = events.some(
      (e) => e.type === "bottle" && e.lifecycle.state === "projected",
    );
    const bottlesRecorded = events.some(
      (e) =>
        e.type === "bottle" &&
        (e.lifecycle.state === "started" || e.lifecycle.state === "completed"),
    );
    // Fire only when no bottles of any kind exist yet — placeholders
    // need a clean slate. Once recordings land, R5.1 owns the cascade.
    return !bottlesProjected && !bottlesRecorded;
  },
  produces: (events, ctx) => projectPlaceholders(ctx, events),
};

function projectPlaceholders(ctx: Context, existing: Event[]): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return existing;

  const { bottlesPerDay, bufferAfterWakeMinutes } = ctx.settings.bottleChain;
  const interval = ctx.settings.defaultBottleIntervalMinutes;

  const placeholders: Event[] = [];
  for (let i = 0; i < bottlesPerDay; i++) {
    const start = wakeTime + bufferAfterWakeMinutes + i * interval;
    const n = i + 1;
    placeholders.push({
      id: `proj_bottle_${n}`,
      dayId: ctx.day.id,
      eventKey: `bottle_${n}`,
      type: "bottle",
      kind: "instant",
      startTime: start,
      label: `Bottle ${n}`,
      hasPutdown: false,
      lifecycle: { state: "projected" },
      amountOz: ctx.settings.defaultBottleAmountOz,
    });
  }

  return [...existing, ...placeholders];
}

/**
 * R5.1 — Once at least one bottle has been recorded, the cascade resumes
 * from the LATEST recorded bottle (by startTime). Projected bottles fill
 * in until the total bottle count meets `bottlesPerDay`.
 *
 * Recorded bottles are never moved or removed (reality wins, §0).
 *
 * Depends on R5.11 only by ordering — once a recording lands, R5.11 stops
 * firing (its match condition is "no bottles of any kind"), and R5.1
 * takes over.
 */
const RuleCascadeFromLatestRecorded: Rule = {
  id: "R5.1",
  description: "Cascade additional projected bottles from the latest recorded bottle",
  matches: (events, ctx) => {
    const bottles = events.filter((e) => e.type === "bottle");
    const hasRecorded = bottles.some((b) => isRecorded(b.lifecycle));
    if (!hasRecorded) return false;
    return bottles.length < ctx.settings.bottleChain.bottlesPerDay;
  },
  produces: (events, ctx) => cascadeFromLatest(ctx, events),
};

function cascadeFromLatest(ctx: Context, existing: Event[]): Event[] {
  const bottles = existing.filter((e) => e.type === "bottle");
  const hasRecorded = bottles.some((b) => isRecorded(b.lifecycle));
  if (!hasRecorded) return existing;

  // Cascade from the latest bottle of ANY kind. The chain may already
  // include projections downstream of a recorded anchor; we extend from
  // the tip, not from the recorded anchor itself, so we don't re-emit
  // at the same times on subsequent evaluator passes.
  const latest = bottles.reduce((max, b) => (b.startTime > max.startTime ? b : max));

  const target = ctx.settings.bottleChain.bottlesPerDay;
  const interval = ctx.settings.defaultBottleIntervalMinutes;
  const needed = target - bottles.length;
  if (needed <= 0) return existing;

  // Find the highest existing eventKey index so new keys don't collide
  // (R5.3 — index from MAX, not latest-by-time).
  const maxIndex = bottles.reduce((m, b) => {
    const match = /^bottle_(\d+)$/.exec(b.eventKey);
    if (!match) return m;
    return Math.max(m, parseInt(match[1]!, 10));
  }, 0);

  // R5.8: cascade stops when the next projected start would land at or
  // after tomorrow's defaultWakeTime. After that point, the bottle
  // belongs to tomorrow, not today.
  const tomorrowWake = ctx.settings.defaultWakeTime + 24 * 60;

  const projections: Event[] = [];
  for (let i = 1; i <= needed; i++) {
    const start = latest.startTime + i * interval;
    if (start >= tomorrowWake) break; // R5.8
    const n = maxIndex + i;
    projections.push({
      id: `proj_bottle_${n}`,
      dayId: ctx.day.id,
      eventKey: `bottle_${n}`,
      type: "bottle",
      kind: "instant",
      startTime: start,
      label: `Bottle ${n}`,
      hasPutdown: false,
      lifecycle: { state: "projected" },
      amountOz: ctx.settings.defaultBottleAmountOz,
    });
  }

  return [...existing, ...projections];
}

/**
 * R5.6 — Move a projected bottle that lands inside a nap to the nap edge
 * that's closer to the predicted interval.
 *
 * Predictive lens (§0): the engine forecasts the *likely* next feed time.
 * Bottles "before nap" vs "after nap" are both plausible; pick the edge
 * closer to the cadence the cascade was already predicting.
 *
 * For each projected bottle whose startTime is strictly inside a nap's
 * (start, end), compute:
 *   predicted = prevBottle.startTime + defaultBottleIntervalMinutes
 * Move to whichever of (nap.startTime, nap.endTime) has smaller
 * |edge - predicted|. If the closer edge is in the past (< nowMinutes),
 * use the far edge instead.
 *
 * Recorded mid-nap bottles are never moved (the §0 reality-wins guard
 * would throw — but we also gate by lifecycle.state === "projected" to
 * make intent explicit).
 *
 * Iterates to fixed point (R5.7) via the evaluator: moving a bottle out
 * of nap_2 might land it inside nap_3, triggering another match.
 */
const RuleMoveProjectedBottleOutOfNap: Rule = {
  id: "R5.6",
  description:
    "Move projected bottles inside naps to whichever edge is closer to the predicted interval",
  // R3.1 (nap chain projection) is NOT listed here even though we need
  // its output: declaring it would force every bottle test to include
  // the nap rules, but R5.6 reads naps from events at evaluation time —
  // if R3.1 hasn't run, there are no naps and R5.6 simply doesn't fire.
  // The evaluator's fixed-point loop ensures R5.6 picks up naps once
  // R3.1 emits them on a subsequent pass.
  dependsOn: ["R5.1", "R5.11"],
  matches: (events) => findFirstOverlap(events) !== null,
  produces: (events, ctx) => {
    const overlap = findFirstOverlap(events);
    if (!overlap) return events;
    const { bottle, region } = overlap;
    // Snap to the merged-interval boundary of transitively-overlapping
    // naps containing the bottle. A bottle landing on the edge of one
    // nap that's inside an adjacent overlapping nap creates a cycle if
    // we look only at directly-containing naps; merging the connected
    // component breaks the cycle.
    const predicted = predictedNextStart(events, bottle, ctx);
    const distBefore = Math.abs(predicted - region.start);
    const distAfter = Math.abs(predicted - region.end);
    let chosen = distBefore <= distAfter ? region.start : region.end;
    if (chosen < ctx.nowMinutes) chosen = chosen === region.start ? region.end : region.start;
    return events.map((e) => (e.id === bottle.id ? { ...e, startTime: chosen } : e));
  },
};

type Region = { start: number; end: number };
type Overlap = { bottle: Event; region: Region };

/**
 * Merge nap intervals that touch or overlap into a single connected
 * region. Returns regions sorted by start; each region's [start, end]
 * is the union boundary the bottle should clear.
 */
function mergedNapRegions(events: Event[]): Region[] {
  const intervals: Region[] = events
    .filter((e) => e.type === "nap" && e.endTime !== undefined)
    .map((e) => ({ start: e.startTime, end: e.endTime! }))
    .sort((a, b) => a.start - b.start);
  const merged: Region[] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

function findFirstOverlap(events: Event[]): Overlap | null {
  const regions = mergedNapRegions(events);
  for (const e of events) {
    if (e.type !== "bottle") continue;
    if (e.lifecycle.state !== "projected") continue;
    const region = regions.find((r) => e.startTime > r.start && e.startTime < r.end);
    if (region) return { bottle: e, region };
  }
  return null;
}

function predictedNextStart(
  events: Event[],
  bottle: Event,
  ctx: { settings: { defaultBottleIntervalMinutes: number } },
): number {
  // The "previous" bottle is the chronologically-closest bottle whose
  // startTime is < this bottle's CURRENT startTime. If none exists,
  // there's no cadence to honor — fall back to current startTime so the
  // edge with smallest |edge - currentStart| is chosen.
  const earlier = events
    .filter((e) => e.type === "bottle" && e.id !== bottle.id && e.startTime < bottle.startTime)
    .sort((a, b) => b.startTime - a.startTime)[0];
  if (!earlier) return bottle.startTime;
  return earlier.startTime + ctx.settings.defaultBottleIntervalMinutes;
}

/**
 * R5.4 — Bottles are renumbered chronologically for display.
 *
 * After cascade and overlap resolution, the engine sorts bottles by
 * startTime and rewrites eventKey/label as `bottle_1`, `bottle_2`, etc.
 * This ensures the timeline shows bottles in monotonic order regardless
 * of how the user inserted them.
 *
 * R5.5: this is engine-side only. Firestore docs keep their original
 * eventKey (the persistence layer reads `id` for lookups, never
 * eventKey). The reality-wins guard allows this rewrite because eventKey
 * and label are display fields, not authoritative recorded fields.
 */
const RuleRenumberBottlesChronologically: Rule = {
  id: "R5.4",
  description: "Renumber bottle eventKey/label chronologically for display",
  dependsOn: ["R5.1", "R5.11"],
  matches: (events) => {
    const bottles = events
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);
    return bottles.some((b, i) => b.eventKey !== `bottle_${i + 1}`);
  },
  produces: (events) => {
    const ordered = [...events].filter((e) => e.type === "bottle");
    ordered.sort((a, b) => a.startTime - b.startTime);
    const renamed = new Map<string, { eventKey: string; label: string }>();
    ordered.forEach((b, i) => {
      const n = i + 1;
      renamed.set(b.id, { eventKey: `bottle_${n}`, label: `Bottle ${n}` });
    });
    return events.map((e) => {
      if (e.type !== "bottle") return e;
      const next = renamed.get(e.id);
      if (!next) return e;
      if (e.eventKey === next.eventKey && e.label === next.label) return e;
      return { ...e, eventKey: next.eventKey, label: next.label };
    });
  },
};

export const RULES: Rule[] = [
  RuleProjectBottlePlaceholders,
  RuleCascadeFromLatestRecorded,
  RuleMoveProjectedBottleOutOfNap,
  RuleRenumberBottlesChronologically,
];
