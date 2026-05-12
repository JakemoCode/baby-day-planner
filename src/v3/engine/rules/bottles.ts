/**
 * R5.x — Bottle rules.
 *
 * Source: docs/v3/REQUIREMENTS.md §5.
 */

import type { Context, Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { intervalForAmount } from "../bottleIntervalRules";
import { hasType, isProjected, isRecordedEvent, projectedEvent } from "../helpers";

// ---------------------------------------------------------------------------
// Bottle helpers
// ---------------------------------------------------------------------------

const isBottle = hasType("bottle");

function buildProjectedBottle(ctx: Context, n: number, startTime: number): Event {
  // ID is keyed to startTime, NOT slot number. Slot number changes when
  // R5.4 renumbers chronologically, so a slot-keyed id would be unstable
  // across passes — the same projection could end up with two different
  // ids on consecutive evaluator passes, which would defeat the
  // fixed-point check and risk convergence loops. startTime is what the
  // event IS; the eventKey/label are how we display it.
  return projectedEvent({
    ctx,
    id: `proj_bottle_t${startTime}`,
    eventKey: `bottle_${n}`,
    type: "bottle",
    kind: "instant",
    startTime,
    label: `Bottle ${n}`,
    amountOz: ctx.settings.defaultBottleAmountOz,
  });
}

// ---------------------------------------------------------------------------
// R5.11 — Project bottle placeholders
// ---------------------------------------------------------------------------

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
    // Fire only when no bottles of any kind exist yet — placeholders
    // need a clean slate. Once recordings land, R5.1 owns the cascade.
    return !events.some(isBottle);
  },
  produces: (events, ctx) => projectPlaceholders(ctx, events),
};

function projectPlaceholders(ctx: Context, existing: Event[]): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return existing;

  const { bottlesPerDay, bufferAfterWakeMinutes } = ctx.settings.bottleChain;
  // No prior recording yet; all placeholders carry defaultBottleAmountOz,
  // so every step's interval looks up the rule for that default amount.
  const interval = intervalForAmount(
    ctx.settings.bottleIntervalRules,
    ctx.settings.defaultBottleAmountOz,
    ctx.settings.defaultBottleIntervalMinutes,
  );
  const firstStart = wakeTime + bufferAfterWakeMinutes;

  const placeholders: Event[] = [];
  for (let i = 0; i < bottlesPerDay; i++) {
    placeholders.push(buildProjectedBottle(ctx, i + 1, firstStart + i * interval));
  }

  return [...existing, ...placeholders];
}

// ---------------------------------------------------------------------------
// R5.1 — Cascade from the latest recorded bottle
// ---------------------------------------------------------------------------

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
    const bottles = events.filter(isBottle);
    if (!bottles.some(isRecordedEvent)) return false;
    return bottles.length < ctx.settings.bottleChain.bottlesPerDay;
  },
  produces: (events, ctx) => cascadeFromLatest(ctx, events),
};

function cascadeFromLatest(ctx: Context, existing: Event[]): Event[] {
  const bottles = existing.filter(isBottle);
  if (!bottles.some(isRecordedEvent)) return existing;

  const target = ctx.settings.bottleChain.bottlesPerDay;
  const needed = target - bottles.length;
  if (needed <= 0) return existing;

  // Cascade from the latest bottle of ANY kind. The chain may already
  // include projections downstream of a recorded anchor; we extend from
  // the tip, not from the recorded anchor itself, so we don't re-emit
  // at the same times on subsequent evaluator passes.
  const latest = bottles.reduce((max, b) => (b.startTime > max.startTime ? b : max));

  // Find the highest existing eventKey index so new keys don't collide
  // (R5.3 — index from MAX, not latest-by-time).
  const maxIndex = bottles.reduce((m, b) => {
    const match = /^bottle_(\d+)$/.exec(b.eventKey);
    if (!match) return m;
    return Math.max(m, parseInt(match[1]!, 10));
  }, 0);

  const defaultInterval = ctx.settings.defaultBottleIntervalMinutes;
  // R5.8: cascade stops when the next projected start would land at or
  // after tomorrow's defaultWakeTime. After that point, the bottle
  // belongs to tomorrow, not today.
  const tomorrowWake = ctx.settings.defaultWakeTime + 24 * 60;

  // Each step's interval depends on the PREVIOUS bottle's amountOz via
  // `bottleIntervalRules` (V2-restored amount-conditional rule). After the
  // first projection, subsequent bottles all carry `defaultBottleAmountOz`,
  // so steps 2..N typically converge on the default-amount rule's interval.
  const projections: Event[] = [];
  let prev = latest;
  for (let i = 1; i <= needed; i++) {
    const interval = intervalForAmount(
      ctx.settings.bottleIntervalRules,
      prev.amountOz,
      defaultInterval,
    );
    const start = prev.startTime + interval;
    if (start >= tomorrowWake) break; // R5.8
    const projection = buildProjectedBottle(ctx, maxIndex + i, start);
    projections.push(projection);
    prev = projection;
  }

  return [...existing, ...projections];
}

// ---------------------------------------------------------------------------
// R5.6 — Move projected bottles out of naps
// ---------------------------------------------------------------------------

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
  matches: (events, ctx) => findFirstOverlap(events, ctx.settings.putdownLeadMinutes) !== null,
  produces: (events, ctx) => {
    const overlap = findFirstOverlap(events, ctx.settings.putdownLeadMinutes);
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
 * Merge nap intervals (extended on the front by `putdownLead` minutes
 * to cover the wind-down window) into connected regions. The wind-down
 * is "no bottles" territory — feeding right before the parent puts the
 * baby down defeats the purpose. The bottle is moved to BEFORE the
 * wind-down, not to nap.start.
 *
 * Returns regions sorted by start; each region's [start, end] is the
 * union boundary the bottle must clear.
 */
function mergedNapRegions(events: Event[], putdownLead: number): Region[] {
  const intervals: Region[] = events
    .filter((e) => e.type === "nap" && e.endTime !== undefined)
    .map((e) => ({ start: e.startTime - putdownLead, end: e.endTime! }))
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

function findFirstOverlap(events: Event[], putdownLead: number): Overlap | null {
  const regions = mergedNapRegions(events, putdownLead);
  if (regions.length === 0) return null;
  for (const event of events) {
    if (!isBottle(event) || !isProjected(event)) continue;
    const region = regions.find((r) => event.startTime > r.start && event.startTime < r.end);
    if (region) return { bottle: event, region };
  }
  return null;
}

function predictedNextStart(events: Event[], bottle: Event, ctx: Context): number {
  // The "previous" bottle is the chronologically-closest bottle whose
  // startTime is < this bottle's CURRENT startTime. If none exists,
  // there's no cadence to honor — fall back to current startTime so the
  // edge with smallest |edge - currentStart| is chosen.
  const earlier = events
    .filter((e) => isBottle(e) && e.id !== bottle.id && e.startTime < bottle.startTime)
    .sort((a, b) => b.startTime - a.startTime)[0];
  if (!earlier) return bottle.startTime;
  const interval = intervalForAmount(
    ctx.settings.bottleIntervalRules,
    earlier.amountOz,
    ctx.settings.defaultBottleIntervalMinutes,
  );
  return earlier.startTime + interval;
}

// ---------------------------------------------------------------------------
// R5.4 — Renumber bottles chronologically
// ---------------------------------------------------------------------------

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
    const ordered = bottlesByStartTime(events);
    return ordered.some((b, i) => b.eventKey !== `bottle_${i + 1}`);
  },
  produces: (events) => {
    const renamed = new Map<string, { eventKey: string; label: string }>();
    bottlesByStartTime(events).forEach((b, i) => {
      const n = i + 1;
      renamed.set(b.id, { eventKey: `bottle_${n}`, label: `Bottle ${n}` });
    });
    return events.map((e) => {
      if (!isBottle(e)) return e;
      const next = renamed.get(e.id);
      if (!next) return e;
      if (e.eventKey === next.eventKey && e.label === next.label) return e;
      return { ...e, eventKey: next.eventKey, label: next.label };
    });
  },
};

function bottlesByStartTime(events: Event[]): Event[] {
  return events.filter(isBottle).sort((a, b) => a.startTime - b.startTime);
}

export const RULES: Rule[] = [
  RuleProjectBottlePlaceholders,
  RuleCascadeFromLatestRecorded,
  RuleMoveProjectedBottleOutOfNap,
  RuleRenumberBottlesChronologically,
];
