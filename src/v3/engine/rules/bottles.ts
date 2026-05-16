/**
 * R5.x — Bottle rules.
 *
 * One sequential cascade rule + chronological renumber. See
 * `docs/v3/SIMPLIFICATION_SCOPE.md` for the design and
 * `DOMAIN.md` §2 for the user-facing domain model.
 *
 * Replaces the previous four-rule system (R5.1 cascade from latest
 * recorded, R5.6 move-out-of-nap, R5.7 fixed-point convergence,
 * R5.11 placeholder projection) with one unified rule. Each step
 * of the cascade computes its time from the PREVIOUS bottle's
 * actual rendered time (post-snap), so the chain stays coherent
 * regardless of which steps got snapped out of naps.
 *
 * Key behaviors (per DOMAIN.md + SIMPLIFICATION_SCOPE.md):
 *   - Anchor: latest non-projected bottle with `startTime >= wakeTime`,
 *     OR `wakeTime + bufferAfterWakeMinutes` when no anchor exists.
 *     Overnight bottles (startTime < wakeTime) tally toward
 *     `bottlesPerDay` but do NOT anchor the cascade — the "midnight
 *     rule": morning rhythm is driven by wake-up, not by mid-night
 *     feeds.
 *   - Forward cascade walks from the anchor at
 *     `intervalForAmount(prev.amountOz, ...)`. Stops at midnight
 *     (1440) — past-midnight bottles belong to tomorrow's chain.
 *   - Backward backfill walks from the EARLIEST non-projected anchor
 *     downward at the same interval, stopping at `wakeTime + buffer`.
 *   - No-feed region is the nap itself only — `[nap.start, nap.end]`,
 *     NOT extended through putdown. Wind-down is render-only; a
 *     bottle can land at or during the wind-down. A bottle landing
 *     STRICTLY inside `(nap.start, nap.end)` snaps to the nearest
 *     edge (with the "if-past-fallback" mirror).
 */

import type { Context, Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { intervalForAmount } from "../bottleIntervalRules";
import { hasType, isProjected, projectedEvent } from "../helpers";
import { MINUTES_PER_DAY } from "../../ui/time";

// ---------------------------------------------------------------------------
// Predicates / helpers
// ---------------------------------------------------------------------------

const isBottle = hasType("bottle");
const isBedtime = hasType("bedtime");

const MIDNIGHT = MINUTES_PER_DAY;

/**
 * Forward cap for the bottle cascade. The day's RHYTHM CHAIN is
 * `[wakeTime, forwardCap)`. Outside that window, bottles are passive
 * members of the day (overnight feeds, dream feeds, baby-wakes-hungry
 * recordings) — they're tallied for the calendar day but don't anchor
 * the cascade and aren't projected forward into.
 *
 * Per DOMAIN.md §1 + §3: baby's waking-and-eating cadence stops at
 * bedtime. Cascading bottle projections through the bedtime block
 * mechanically would predict feeds during sleep, which is wrong.
 *
 * Resolution: cap forward cascade at the projected bedtime's startTime
 * if present, falling back to midnight (the "midnight rule" boundary)
 * if no bedtime has been projected yet.
 *
 * Idempotency: bedtime is emitted by R3.1 (the sleep cascade) in the
 * same pass, so the bottle cascade sees it as soon as the sleep
 * cascade fires. Fallback to MIDNIGHT remains for the no-bedtime
 * case (e.g. wakeWindowsMinutes doesn't extend far enough to trigger
 * threshold substitution).
 */
function forwardCapFor(events: Event[]): number {
  const bedtime = events.find(isBedtime);
  if (!bedtime) return MIDNIGHT;
  return Math.min(MIDNIGHT, bedtime.startTime);
}

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

type Region = { start: number; end: number };

/**
 * Nap regions for the bottle snap check. Per DOMAIN.md §4 and
 * SIMPLIFICATION_SCOPE.md §2.1, the no-feed region is the nap ITSELF
 * (`[nap.start, nap.end]`) — NOT extended backward through putdown.
 * Wind-down is render-only synthetic; a bottle can land during it.
 *
 * Overlapping naps are merged into one region — otherwise a bottle
 * could snap out of nap A only to land inside nap B (a real edge case
 * caught by the property test in `properties.test.ts`).
 */
function napRegions(events: Event[]): Region[] {
  const raw = events
    .filter((e) => e.type === "nap" && e.endTime !== undefined)
    .map((e) => ({ start: e.startTime, end: e.endTime! }))
    .sort((a, b) => a.start - b.start);
  const merged: Region[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/**
 * If `proposed` lands STRICTLY inside any nap region, snap to whichever
 * edge is closer to `proposed`. Tie favors `region.start` (bottle
 * before nap is generally preferred — see DOMAIN.md §4: bottle CAN BE
 * the wind-down). If the chosen edge is in the past relative to
 * `nowMinutes`, use the other edge.
 *
 * If no overlap, returns `proposed` unchanged.
 */
function snapOutOfNap(proposed: number, regions: Region[], nowMinutes: number): number {
  const region = regions.find((r) => proposed > r.start && proposed < r.end);
  if (!region) return proposed;
  const distBefore = Math.abs(proposed - region.start);
  const distAfter = Math.abs(proposed - region.end);
  let chosen = distBefore <= distAfter ? region.start : region.end;
  if (chosen < nowMinutes) {
    // Past-edge fallback: prefer the other edge ONLY if it's not also
    // in the past. With both edges past (baby slept through the
    // morning-buffer window in a property-test fixture), holding the
    // closer choice avoids a snap-to-pre-wake time that would then
    // get trimmed by the chain-range filter, looping the cascade.
    const other = chosen === region.start ? region.end : region.start;
    if (other >= nowMinutes) chosen = other;
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// R5 — Sequential bottle cascade (unified)
// ---------------------------------------------------------------------------

const RuleSequentialBottleCascade: Rule = {
  id: "R5",
  description:
    "Sequential bottle cascade: anchor → propose → snap-out-of-nap → advance, bidirectional, midnight-capped",
  // Naps may not be projected yet on the first pass; the evaluator's
  // fixed-point loop re-runs this rule once R3.1 emits them. We don't
  // declare R3.1 as a hard dependency because some bottle tests run
  // without the nap rules and expect placeholders regardless.
  matches: (events, ctx) => {
    if (ctx.day.wakeTime === undefined) return false;
    return canCascade(events, ctx);
  },
  produces: (events, ctx) => projectBottleChain(events, ctx),
};

/**
 * Match-time predicate: is there any way this cascade could add more
 * bottles? Two cases:
 *
 *   1. Cold-start (no non-projected morning bottles): gate on
 *      `bottles.length < bottlesPerDay`. The setting defines how many
 *      placeholders to draw when there's no real data to cascade
 *      from.
 *
 *   2. Anchored (at least one non-projected morning bottle): no
 *      total-count cap. Predict-don't-prescribe (DOMAIN.md §2):
 *      forward cascade always extends to midnight; backfill always
 *      walks to wake+buffer; `bottlesPerDay` is the *cold-start
 *      target*, not a hard upper bound on the day's predictions.
 *      Match returns true if the cascade could add forward OR
 *      backward, false once both directions are saturated.
 *
 * Idempotency: once `produces` has filled all addable slots, this
 * predicate returns false and the evaluator stops re-firing.
 */
function canCascade(events: Event[], ctx: Context): boolean {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return false;
  const bottles = events.filter(isBottle);
  const cap = forwardCapFor(events);

  // Trimming check: any PROJECTED bottle outside the rhythm chain
  // [wakeTime, cap) needs to be removed. Fires when bedtime appears
  // mid-flight and pass-1's midnight-capped projections are now
  // past-bedtime stragglers.
  const needsTrim = bottles.some(
    (b) => isProjected(b) && (b.startTime < wakeTime || b.startTime >= cap),
  );
  if (needsTrim) return true;

  // Chain bottles: in-window for the day's rhythm chain.
  const chainBottles = bottles
    .filter((b) => b.startTime >= wakeTime && b.startTime < cap)
    .sort((a, b) => a.startTime - b.startTime);
  const anchors = chainBottles.filter((b) => !isProjected(b));
  const target = ctx.settings.bottleChain.bottlesPerDay;

  if (anchors.length === 0) {
    // Cold-start case: gated on count.
    return bottles.length < target;
  }

  // Anchored case: check if cascade could extend in either direction.
  const wakeBuffer = wakeTime + ctx.settings.bottleChain.bufferAfterWakeMinutes;
  const defaultInterval = ctx.settings.defaultBottleIntervalMinutes;
  const rules = ctx.settings.bottleIntervalRules;
  const latest = chainBottles[chainBottles.length - 1]!;
  const earliest = chainBottles[0]!;
  const forwardInterval = intervalForAmount(rules, latest.amountOz, defaultInterval);
  const canExtendForward = forwardInterval > 0 && latest.startTime + forwardInterval < cap;
  const backwardInterval = intervalForAmount(rules, earliest.amountOz, defaultInterval);
  const canExtendBackward =
    backwardInterval > 0 && earliest.startTime - backwardInterval >= wakeBuffer;
  return canExtendForward || canExtendBackward;
}

function projectBottleChain(events: Event[], ctx: Context): Event[] {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return events;

  const target = ctx.settings.bottleChain.bottlesPerDay;
  const cap = forwardCapFor(events);
  const wakeBuffer = wakeTime + ctx.settings.bottleChain.bufferAfterWakeMinutes;
  const defaultInterval = ctx.settings.defaultBottleIntervalMinutes;
  const rules = ctx.settings.bottleIntervalRules;

  // Step 1: trim projected bottles outside the rhythm chain
  // [wakeTime, cap). These are stale pass-1 projections that became
  // past-bedtime (or overnight, defensively) once R7.6 emitted a
  // bedtime event. Recorded / overridden bottles are NEVER trimmed —
  // they're protected by the reality-wins axiom and represent passive
  // members of the day (overnight feeds, dream feeds, etc.).
  const trimmedEvents = events.filter((e) => {
    if (!isBottle(e)) return true;
    if (!isProjected(e)) return true;
    return e.startTime >= wakeTime && e.startTime < cap;
  });

  const bottles = trimmedEvents.filter(isBottle);
  const regions = napRegions(trimmedEvents);

  // Chain bottles: in-window for the day's rhythm chain. Outside-window
  // bottles (overnight, post-bedtime recordings) tally toward
  // bottlesPerDay but do NOT anchor cascade or backfill (DOMAIN.md §1
  // + §3: cascade follows the wake-to-bedtime rhythm).
  const chainBottles = bottles
    .filter((b) => b.startTime >= wakeTime && b.startTime < cap)
    .sort((a, b) => a.startTime - b.startTime);
  const anchors = chainBottles.filter((b) => !isProjected(b));
  const isAnchored = anchors.length > 0;

  // Highest bottle eventKey index for new keys (R5.4 renumbers anyway,
  // but stable keys per pass keep the fixed-point check from looping).
  const maxIndex = bottles.reduce((m, b) => {
    const match = /^bottle_(\d+)$/.exec(b.eventKey);
    return match ? Math.max(m, parseInt(match[1]!, 10)) : m;
  }, 0);

  let nextIndex = maxIndex + 1;
  const projections: Event[] = [];
  let totalCount = bottles.length;

  const snap = (proposed: number) => snapOutOfNap(proposed, regions, ctx.nowMinutes);

  // The cold-start count cap (bottlesPerDay placeholders) ONLY applies
  // when there are no non-projected morning anchors. Once a real
  // recording exists, the cascade follows cadence to midnight — the
  // setting is a TARGET for cold-start, not a HARD CAP on the day's
  // predictions. Predict-don't-prescribe (DOMAIN.md §2): if baby has
  // already had bottlesPerDay+ feeds (e.g., on a sick day), the engine
  // should still predict the rest of the afternoon.
  const reachedColdStartCap = () => !isAnchored && totalCount >= target;

  // === Backward backfill ===
  // Walks from the EARLIEST morning bottle backward at -interval steps,
  // gated on:
  //   - Only fires if there's a non-projected anchor somewhere in the
  //     chain (otherwise we'd phantom-anchor a cold-start chain at its
  //     own wake+buffer seed).
  //   - Stops at wake+buffer.
  //   - Uses the earliest CURRENT morning bottle as the walker's `prev`
  //     so subsequent evaluator passes extend from prior projections
  //     instead of re-emitting them (idempotency).
  if (isAnchored && chainBottles.length > 0) {
    let prev = chainBottles[0]!;
    // No total-count cap here: backfill only fires in the anchored
    // case, which has no cap (see reachedColdStartCap()).
    while (true) {
      // Defensive: an interval ≤ 0 from malformed rules / fixtures
      // would cause an infinite loop. Treat as "no further cascade
      // possible in this direction."
      const interval = intervalForAmount(rules, prev.amountOz, defaultInterval);
      if (interval <= 0) break;
      const proposed = prev.startTime - interval;
      if (proposed < wakeBuffer) break;
      const placed = snap(proposed);
      if (placed < wakeBuffer) break;
      // Snap can land at a region edge that equals (or is past) the
      // previous prev.startTime, which would loop. Strict-monotonic
      // guard:
      if (placed >= prev.startTime) break;
      const projection = buildProjectedBottle(ctx, nextIndex++, placed);
      projections.push(projection);
      totalCount++;
      prev = projection;
    }
  }

  // === Forward cascade ===
  // Uses the LATEST chain bottle (recorded, overridden, OR projected
  // from a prior pass) as the walker's `prev`. Idempotency: subsequent
  // evaluator passes extend the chain instead of re-emitting it.
  // Cap = bedtime.startTime if a bedtime exists, else MIDNIGHT — the
  // cascade stops at the boundary between today's rhythm chain and
  // overnight / tomorrow.
  let prev: Event;
  if (chainBottles.length > 0) {
    prev = chainBottles[chainBottles.length - 1]!;
  } else {
    // Cold start: seed the first bottle at wake+buffer.
    if (reachedColdStartCap()) return [...trimmedEvents, ...projections];
    if (wakeBuffer >= cap) return [...trimmedEvents, ...projections];
    const seed = snap(wakeBuffer);
    if (seed >= cap) return [...trimmedEvents, ...projections];
    // If snap pushed the seed before wakeTime, the cold-start slot
    // can't be placed cleanly (a recorded nap straddles the
    // wake-buffer window). Refuse to seed — the trim filter would
    // remove it on the next pass anyway, causing a convergence
    // loop.
    if (seed < wakeTime) return [...trimmedEvents, ...projections];
    const firstProj = buildProjectedBottle(ctx, nextIndex++, seed);
    projections.push(firstProj);
    totalCount++;
    prev = firstProj;
  }

  while (true) {
    if (reachedColdStartCap()) break; // cold-start: stop at bottlesPerDay
    // Defensive: an interval ≤ 0 from malformed rules / fixtures would
    // cause an infinite loop. Treat as "cascade exhausted."
    const interval = intervalForAmount(rules, prev.amountOz, defaultInterval);
    if (interval <= 0) break;
    const proposed = prev.startTime + interval;
    if (proposed >= cap) break; // bedtime / midnight cap
    const placed = snap(proposed);
    if (placed >= cap) break;
    // Strict-monotonic guard: snap to a nap edge could in pathological
    // cases land at or before prev.startTime, looping.
    if (placed <= prev.startTime) break;
    const projection = buildProjectedBottle(ctx, nextIndex++, placed);
    projections.push(projection);
    totalCount++;
    prev = projection;
  }

  return [...trimmedEvents, ...projections];
}

// ---------------------------------------------------------------------------
// R5.4 — Renumber bottles chronologically
// ---------------------------------------------------------------------------

/**
 * R5.4 — Bottles are renumbered chronologically for display.
 *
 * After cascade produces a complete chain, sort bottles by startTime
 * and rewrite eventKey/label as `bottle_1`, `bottle_2`, etc. for
 * display. This is engine-side only; Firestore docs keep their
 * original eventKey (the persistence layer reads `id`, never
 * eventKey).
 */
const RuleRenumberBottlesChronologically: Rule = {
  id: "R5.4",
  description: "Renumber bottle eventKey/label chronologically for display",
  dependsOn: ["R5"],
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

export const RULES: Rule[] = [RuleSequentialBottleCascade, RuleRenumberBottlesChronologically];
