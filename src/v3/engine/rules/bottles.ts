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
 *     OR `wakeTime + bufferAfterWakeMinutes` when no anchor exists
 *     (cold-start seed). Overnight bottles (startTime < wakeTime) tally
 *     toward `bottlesPerDay` but do NOT anchor the cascade — the
 *     "midnight rule": morning rhythm is driven by wake-up, not by
 *     mid-night feeds.
 *   - Overnight-near-wake guard (§F54): if a non-projected overnight
 *     bottle exists and its `startTime + intervalForAmount(amountOz)`
 *     lands AFTER `wakeTime + bufferAfterWakeMinutes`, the cold-start
 *     seed shifts forward to that later time. Baby fed at 5am with
 *     6oz (240min interval) waking at 7am shouldn't be projected to
 *     eat again at 7:30am — the first morning bottle anchors at 9am.
 *   - Forward cascade walks from the anchor at
 *     `intervalForAmount(prev.amountOz, ...)`. Stops at midnight
 *     (1440) — past-midnight bottles belong to tomorrow's chain.
 *   - DOMAIN.md §2: "The moment a real recording exists, the cascade
 *     follows cadence to midnight." Forward-only; no backward backfill.
 *     A real recording PROJECTING earlier ghosts contradicts the
 *     forecast-from-reality principle.
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

const DREAM_FEED_EVENT_KEY = "bottle_dream";

/**
 * The dream-feed slot is a sentinel — it has the type "bottle" but
 * lives outside the rhythm chain by design (R5.5). All rhythm-cascade
 * sites that walk over bottles (trim, renumber, chronological index)
 * must skip it to avoid corrupting cascade math or looping the engine.
 */
function isDreamFeed(e: Event): boolean {
  return e.eventKey === DREAM_FEED_EVENT_KEY;
}

/**
 * The dream-feed slot — a special projected bottle anchored to
 * `settings.dreamFeedTime` (post-bedtime). Distinct `eventKey` so the
 * cascade and dedup paths can identify it without time-window heuristics.
 * Subject to Now-cross auto-promote like any projected bottle (ADR-0001).
 */
function buildProjectedDreamFeed(ctx: Context, startTime: number): Event {
  return projectedEvent({
    ctx,
    id: `proj_${DREAM_FEED_EVENT_KEY}`,
    eventKey: DREAM_FEED_EVENT_KEY,
    type: "bottle",
    kind: "instant",
    startTime,
    label: "Dream Feed",
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
 * Putdown bottle-anchor rule (CONTEXT.md "putdown bottle-anchor rule"):
 * if `proposed` lands in the range
 * `[parent.startTime - putdownLeadMinutes, parent.startTime + napLen/2]`
 * for an adjacent nap or bedtime, snap to
 * `parent.startTime - putdownLeadMinutes` (the start of putdown). The
 * bottle wind-down IS the start of putdown, and per Jake's framing
 * "any projected bottle must snap to either the beginning of putdown
 * or the end of the nap" — snapping to nap.startTime itself would
 * misrepresent the bottle's start time (the bottle BEGINS at putdown
 * start, not at the moment the baby falls asleep).
 *
 * Applies to BOTH projected and recorded naps:
 * - Projected naps use `napLengthMinutes` (the default) for the
 *   first-half computation.
 * - Recorded naps use their actual `endTime - startTime`.
 * In both cases, ADR-0006 Concern B prevents retroactive shifts: if
 * the snap target is past `nowMinutes`, the snap is skipped. Past
 * recorded naps therefore never trigger a snap; only future naps
 * (projected or, rarely, future-recorded) attract bottles.
 *
 * For bedtime, "first half" doesn't apply — only the lead-in window
 * `[parent.startTime - putdownLeadMinutes, parent.startTime]`.
 *
 * ADR-0006 Concern B (no retroactive shift): if the snap target would
 * land at or before `nowMinutes`, the snap is SKIPPED and `proposed`
 * is returned unchanged.
 *
 * If no nap/bedtime in the range, returns `proposed` unchanged.
 */
function snapToPutdown(
  proposed: number,
  events: Event[],
  putdownLeadMinutes: number,
  napLengthMinutes: number,
  nowMinutes: number,
): number {
  for (const ev of events) {
    if (ev.type !== "nap" && ev.type !== "bedtime") continue;
    // For nap: snap window extends to the midpoint of the nap's actual
    // duration (recorded) or the default. Bedtime has no midpoint (half=0).
    const napLen =
      ev.type !== "nap"
        ? 0
        : ev.endTime !== undefined
          ? ev.endTime - ev.startTime
          : napLengthMinutes;
    const half = Math.floor(napLen / 2);
    const lo = ev.startTime - putdownLeadMinutes;
    const hi = ev.startTime + half;
    if (proposed < lo || proposed > hi) continue;
    const snapTarget = ev.startTime - putdownLeadMinutes;
    // ADR-0006 Concern B: skip THIS nap's snap rather than
    // retroactively pull the bottle into the past. Continue the loop
    // — a later (future) nap may still legitimately attract proposed.
    // (Bare narrow case: proposed lands in a recent past nap's range
    // AND in a future nap's range; the past one would otherwise
    // short-circuit and block the legitimate future snap.)
    if (snapTarget <= nowMinutes) continue;
    return snapTarget;
  }
  return proposed;
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
 *      forward cascade extends to midnight; `bottlesPerDay` is the
 *      *cold-start target*, not a hard upper bound on the day's
 *      predictions. Match returns true if the cascade could add
 *      forward, false once forward is saturated. (No backfill: per
 *      DOMAIN §2 "the moment a real recording exists, the cascade
 *      follows cadence to midnight" — forward only.)
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
  // past-bedtime stragglers. Dream-feed slot lives outside the cap
  // by design (see R5.5) and is preserved.
  const needsTrim = bottles.some(
    (b) => isProjected(b) && !isDreamFeed(b) && (b.startTime < wakeTime || b.startTime >= cap),
  );
  if (needsTrim) return true;

  // Chain bottles: in-window for the day's rhythm chain. Dream-feed
  // is sentinel, never a rhythm-chain member — even if dreamFeedTime
  // falls inside [wakeTime, cap) by user misconfiguration, it must
  // not anchor cascade or inflate the cold-start count.
  const chainBottles = bottles
    .filter((b) => !isDreamFeed(b) && b.startTime >= wakeTime && b.startTime < cap)
    .sort((a, b) => a.startTime - b.startTime);
  const anchors = chainBottles.filter((b) => !isProjected(b));
  const target = ctx.settings.bottleChain.bottlesPerDay;

  if (anchors.length === 0) {
    // Cold-start case: gated on count. DOMAIN §2: bottlesPerDay is
    // the cold-start target for the DAYTIME RHYTHM, not the day's
    // total feed count. Overnight bottles tally toward the day but
    // don't consume a daytime slot — a baby who ate overnight
    // shouldn't get fewer morning/afternoon predictions than one
    // who didn't. Compare against chainBottles, not bottles.
    return chainBottles.length < target;
  }

  // Anchored case: check if cascade could extend forward. DOMAIN §2:
  // "moment a real recording exists, the cascade follows cadence to
  // midnight" — forward-only, no backward backfill.
  const defaultInterval = ctx.settings.defaultBottleIntervalMinutes;
  const rules = ctx.settings.bottleIntervalRules;
  const latest = chainBottles[chainBottles.length - 1]!;
  const forwardInterval = intervalForAmount(rules, latest.amountOz, defaultInterval);
  return forwardInterval > 0 && latest.startTime + forwardInterval < cap;
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
  // bedtime event. Recorded / recorded bottles are NEVER trimmed —
  // they're protected by the reality-wins axiom and represent passive
  // members of the day (overnight feeds, dream feeds, etc.).
  const trimmedEvents = events.filter((e) => {
    if (!isBottle(e)) return true;
    if (!isProjected(e)) return true;
    // Dream-feed slot (R5.5) lives outside [wakeTime, cap) by design.
    if (isDreamFeed(e)) return true;
    return e.startTime >= wakeTime && e.startTime < cap;
  });

  const bottles = trimmedEvents.filter(isBottle);
  const regions = napRegions(trimmedEvents);

  // Chain bottles: in-window for the day's rhythm chain. Outside-window
  // bottles (overnight, post-bedtime recordings) tally toward
  // bottlesPerDay but do NOT anchor cascade or backfill (DOMAIN.md §1
  // + §3: cascade follows the wake-to-bedtime rhythm). Dream-feed is
  // also excluded — sentinel slot, not a rhythm-chain member.
  const chainBottles = bottles
    .filter((b) => !isDreamFeed(b) && b.startTime >= wakeTime && b.startTime < cap)
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
  // Count daytime-chain bottles only — `bottlesPerDay` is the
  // cold-start target for the daytime rhythm, not the day's total
  // feed count. Overnight bottles tally toward the day but don't
  // consume a daytime slot (paired with canCascade's same fix).
  let chainCount = chainBottles.length;

  const snap = (proposed: number) => {
    // snapOutOfNap moves a bottle proposed strictly inside a nap to the
    // nearer edge. snapToPutdown then applies the putdown-anchor rule
    // (CONTEXT.md): bottles whose cascade-natural time lands in the
    // putdown window or the first half of a projected nap snap to the
    // start of putdown. ADR-0006 Concern B: putdown snap is skipped if
    // the target would land in the past.
    //
    // Final snapOutOfNap pass: putdown-anchor moves the bottle to
    // `nap.startTime - putdownLeadMinutes`. In pathological cases
    // (e.g., the previous nap ends < putdownLead minutes before the
    // next nap's start), that target can land strictly inside the
    // previous nap. Re-applying snapOutOfNap moves it cleanly out.
    const noNap = snapOutOfNap(proposed, regions, ctx.nowMinutes);
    const withPutdown = snapToPutdown(
      noNap,
      trimmedEvents,
      ctx.settings.putdownLeadMinutes,
      ctx.settings.defaultNapLengthMinutes,
      ctx.nowMinutes,
    );
    return snapOutOfNap(withPutdown, regions, ctx.nowMinutes);
  };

  // The cold-start count cap (bottlesPerDay placeholders) ONLY applies
  // when there are no non-projected morning anchors. Once a real
  // recording exists, the cascade follows cadence to midnight — the
  // setting is a TARGET for cold-start, not a HARD CAP on the day's
  // predictions. Predict-don't-prescribe (DOMAIN.md §2): if baby has
  // already had bottlesPerDay+ feeds (e.g., on a sick day), the engine
  // should still predict the rest of the afternoon.
  const reachedColdStartCap = () => !isAnchored && chainCount >= target;

  // §F54 — Overnight-near-wake guard. If a non-projected overnight
  // bottle (startTime < wakeTime) lands close enough to wake that its
  // forward interval extends past wake+buffer, shift the cold-start
  // seed forward. Without this, baby fed at 5am with 240min interval
  // and waking at 7am would still get a projected morning bottle at
  // 7:30am — but baby isn't hungry yet. DOMAIN §2: "interval-until-
  // next-feed depends on what was actually consumed."
  //
  // Only matters when there's no in-chain anchor (cold start). An
  // anchored chain already uses the latest in-chain bottle as prev
  // for the forward walk; the overnight bottle is structurally
  // outside the chain by the midnight rule (chainBottles filter at
  // line ~261).
  const overnightAnchors = bottles
    .filter((b) => !isProjected(b) && b.startTime < wakeTime)
    .sort((a, b) => a.startTime - b.startTime);
  const latestOvernight = overnightAnchors.at(-1);
  const overnightProposedSeed =
    latestOvernight !== undefined
      ? latestOvernight.startTime +
        intervalForAmount(rules, latestOvernight.amountOz, defaultInterval)
      : undefined;
  const seedTime =
    overnightProposedSeed !== undefined && overnightProposedSeed > wakeBuffer
      ? overnightProposedSeed
      : wakeBuffer;

  // === Forward cascade ===
  // Uses the LATEST chain bottle (recorded, recorded, OR projected
  // from a prior pass) as the walker's `prev`. Idempotency: subsequent
  // evaluator passes extend the chain instead of re-emitting it.
  // Cap = bedtime.startTime if a bedtime exists, else MIDNIGHT — the
  // cascade stops at the boundary between today's rhythm chain and
  // overnight / tomorrow.
  let prev: Event;
  if (chainBottles.length > 0) {
    prev = chainBottles[chainBottles.length - 1]!;
  } else {
    // Cold start: seed the first bottle at `seedTime` — typically
    // wake+buffer, shifted later by the §F54 overnight-near-wake
    // guard above when an overnight feed is close to wake.
    if (reachedColdStartCap()) return [...trimmedEvents, ...projections];
    if (seedTime >= cap) return [...trimmedEvents, ...projections];
    const seed = snap(seedTime);
    if (seed >= cap) return [...trimmedEvents, ...projections];
    // If snap pushed the seed before wakeTime, the cold-start slot
    // can't be placed cleanly (a recorded nap straddles the
    // wake-buffer window). Refuse to seed — the trim filter would
    // remove it on the next pass anyway, causing a convergence
    // loop.
    if (seed < wakeTime) return [...trimmedEvents, ...projections];
    const firstProj = buildProjectedBottle(ctx, nextIndex++, seed);
    projections.push(firstProj);
    chainCount++;
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
    chainCount++;
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
      // Dream-feed slot has its own stable eventKey + label; renumber
      // would rename it to `bottle_N` and reset the label to `Bottle N`,
      // breaking the dream-feed identity AND looping the cascade
      // (R5.5's identity check keys on eventKey).
      if (isDreamFeed(e)) return e;
      const next = renamed.get(e.id);
      if (!next) return e;
      if (e.eventKey === next.eventKey && e.label === next.label) return e;
      return { ...e, eventKey: next.eventKey, label: next.label };
    });
  },
};

function bottlesByStartTime(events: Event[]): Event[] {
  // Exclude dream-feed from the chronological order — it's a sentinel
  // slot, not a rhythm-chain bottle. Including it would shift its index
  // when its position relative to rhythm bottles changes.
  return events
    .filter(isBottle)
    .filter((b) => !isDreamFeed(b))
    .sort((a, b) => a.startTime - b.startTime);
}

// ---------------------------------------------------------------------------
// R5.5 — Dream-feed emission
// ---------------------------------------------------------------------------

/**
 * Whether any non-projected bottle exists strictly after bedtime.
 * Per Jake's §F66 framing: if the user records a feed after bedtime
 * (e.g. 22:00 wake-feed), THAT recording IS the dream feed for the
 * night — the projected slot at `dreamFeedTime` should be suppressed
 * rather than rendered as a second post-bedtime bottle. The legacy
 * `applyDreamFeedLabel` render pass then relabels that recorded
 * bottle as "Dream Feed", so exactly one dream-feed chip appears.
 */
function hasRecordedPostBedtimeBottle(events: Event[]): boolean {
  const bedtime = events.find(isBedtime);
  if (!bedtime) return false;
  return events.some((e) => isBottle(e) && !isProjected(e) && e.startTime > bedtime.startTime);
}

/**
 * Emits the projected dream-feed bottle at `settings.dreamFeedTime`
 * when enabled, idempotently. Runs after the rhythm cascade so it
 * doesn't interact with R5's trim/saturation logic. Subject to
 * Now-cross auto-promote like any projected bottle (ADR-0001).
 *
 * Suppression: when a recorded post-bedtime bottle already exists,
 * that recording IS the dream feed for the night and the projection
 * is skipped (avoids two "Dream Feed" chips on the timeline).
 */
const RuleDreamFeedEmit: Rule = {
  id: "R5.5",
  description: "Emit projected dream-feed bottle at settings.dreamFeedTime",
  dependsOn: ["R5"],
  matches: (events, ctx) => {
    if (!ctx.settings.dreamFeedEnabled) return false;
    // §F66 fast-follow: per-day skip via Day.suppressedDreamFeed
    // (drawer "delete" on the dream-feed slot writes this field).
    if (ctx.day.suppressedDreamFeed) return false;
    if (events.some((e) => isBottle(e) && isDreamFeed(e))) return false;
    if (hasRecordedPostBedtimeBottle(events)) return false;
    return true;
  },
  produces: (events, ctx) => [...events, buildProjectedDreamFeed(ctx, ctx.settings.dreamFeedTime)],
};

export const RULES: Rule[] = [
  RuleSequentialBottleCascade,
  RuleRenumberBottlesChronologically,
  RuleDreamFeedEmit,
];
