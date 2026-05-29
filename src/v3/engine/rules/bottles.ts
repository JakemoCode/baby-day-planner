/**
 * R5 — Bottle cascade: anchor → forward-walk → snap-out-of-nap, bedtime-capped.
 * R5.4 — Chronological renumber of bottle labels (recorded + projected).
 * R5.5 — Dream-feed emission.
 */

import type { Context, Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { intervalForAmount } from "../bottleIntervalRules";
import { isBedtime, isBottle, isProjected, projectedEvent } from "../helpers";
import { MINUTES_PER_DAY } from "../../ui/time";
import { DREAM_FEED_EVENT_KEY, isDreamFeed } from "../../lib/eventConventions";

const MIDNIGHT = MINUTES_PER_DAY;

/** Parse `bottle_N` → N; returns null for non-numbered keys (e.g. `bottle_dream`). */
function bottleIndexFromKey(eventKey: string): number | null {
  const match = /^bottle_(\d+)$/.exec(eventKey);
  return match ? parseInt(match[1]!, 10) : null;
}

/**
 * Upper bound for the forward cascade: bedtime.startTime if present, else
 * midnight. Bottles outside [wakeTime, cap) are day members but never
 * anchor the cascade.
 */
function forwardCapFor(events: Event[]): number {
  const bedtime = events.find(isBedtime);
  if (!bedtime) return MIDNIGHT;
  return Math.min(MIDNIGHT, bedtime.startTime);
}

// ID keyed to startTime so it stays stable across R5.4 renumber passes;
// slot-keyed ids would change each pass and defeat the fixed-point check.
function buildBottleProjection(
  ctx: Context,
  id: string,
  eventKey: string,
  label: string,
  startTime: number,
): Event {
  return projectedEvent({
    ctx,
    id,
    eventKey,
    type: "bottle",
    kind: "instant",
    startTime,
    label,
    amountOz: ctx.settings.defaultBottleAmountOz,
  });
}

function buildProjectedBottle(ctx: Context, n: number, startTime: number): Event {
  return buildBottleProjection(
    ctx,
    `proj_bottle_t${startTime}`,
    `bottle_${n}`,
    `Bottle ${n}`,
    startTime,
  );
}

/** Projected dream-feed bottle; distinct eventKey keeps it out of cascade dedup logic. */
function buildProjectedDreamFeed(ctx: Context, startTime: number): Event {
  return buildBottleProjection(
    ctx,
    `proj_${DREAM_FEED_EVENT_KEY}`,
    DREAM_FEED_EVENT_KEY,
    "Dream Feed",
    startTime,
  );
}

type Region = { start: number; end: number };

/**
 * Merged nap regions for snap checks. No-feed region is the nap itself;
 * putdown/wind-down is render-only and not excluded. Overlapping naps are
 * merged so a snap from nap A can't land inside nap B.
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
 * If `proposed` falls in `[nap.start - lead, nap.start + napLen/2]`, snap
 * to putdown start (`nap.start - lead`). Bedtime uses only the lead window.
 * Skipped when the snap target is ≤ nowMinutes (no retroactive shift).
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
    // Bedtime has no midpoint (half=0); nap uses actual or default duration.
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
    // No retroactive snap: if putdown start is past, snapForwardToNapEnd takes over.
    if (snapTarget <= nowMinutes) continue;
    return snapTarget;
  }
  return proposed;
}

/**
 * Snaps `proposed` to the nearest nap edge when it falls strictly inside a
 * nap region. Ties favor `region.start`. Falls back to the other edge if
 * the chosen one is in the past.
 */
function snapOutOfNap(proposed: number, regions: Region[], nowMinutes: number): number {
  const region = regions.find((r) => proposed > r.start && proposed < r.end);
  if (!region) return proposed;
  const distBefore = Math.abs(proposed - region.start);
  const distAfter = Math.abs(proposed - region.end);
  let chosen = distBefore <= distAfter ? region.start : region.end;
  if (chosen < nowMinutes) {
    // With both edges past, hold the closer choice to avoid a snap-to-pre-wake loop.
    const other = chosen === region.start ? region.end : region.start;
    if (other >= nowMinutes) chosen = other;
  }
  return chosen;
}

/**
 * When `proposed` falls in `[nap.start - lead, nap.end]` and the putdown era
 * has opened (`lo ≤ now`), snap to `nap.endTime`. Future putdowns (`lo > now`)
 * are handled by snapToPutdown; this function skips them.
 */
function snapForwardToNapEnd(
  proposed: number,
  regions: Region[],
  putdownLead: number,
  nowMinutes: number,
): number {
  for (const r of regions) {
    const lo = r.start - putdownLead;
    if (proposed < lo || proposed > r.end) continue;
    if (r.end <= nowMinutes) continue; // block already past; auto-promote handles it
    if (lo > nowMinutes) continue; // future putdown: handled by snapToPutdown
    return r.end;
  }
  return proposed;
}

// ---------------------------------------------------------------------------
// R5 — Sequential bottle cascade (unified)
// ---------------------------------------------------------------------------

const RuleSequentialBottleCascade: Rule = {
  id: "R5",
  description:
    "Sequential bottle cascade: anchor → propose → snap-out-of-nap → advance, bidirectional, midnight-capped",
  // No hard dependsOn R3.1 — some bottle tests run without nap rules.
  matches: (events, ctx) => {
    if (ctx.day.wakeTime === undefined) return false;
    return canCascade(events, ctx);
  },
  produces: (events, ctx) => projectBottleChain(events, ctx),
};

/**
 * True when the cascade could emit more bottles: cold-start (count < bottlesPerDay)
 * or anchored (latest bottle's next interval fits before cap), or stale projections
 * need trimming.
 */
function canCascade(events: Event[], ctx: Context): boolean {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return false;
  const bottles = events.filter(isBottle);
  const cap = forwardCapFor(events);

  // Trimming: projected bottles outside [wakeTime, cap) are stale pass-1 results.
  // Dream-feed lives outside cap by design and is preserved.
  const needsTrim = bottles.some(
    (b) => isProjected(b) && !isDreamFeed(b) && (b.startTime < wakeTime || b.startTime >= cap),
  );
  if (needsTrim) return true;

  // Chain bottles: in-window, excluding dream-feed (sentinel, not a rhythm member).
  const chainBottles = bottles
    .filter((b) => !isDreamFeed(b) && b.startTime >= wakeTime && b.startTime < cap)
    .sort((a, b) => a.startTime - b.startTime);
  const anchors = chainBottles.filter((b) => !isProjected(b));
  const target = ctx.settings.bottleChain.bottlesPerDay;

  if (anchors.length === 0) {
    // Cold-start: compare against chain (not total) — overnight bottles don't consume daytime slots.
    return chainBottles.length < target;
  }

  // Anchored: check if cascade could extend forward (forward-only; no backfill).
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

  // Trim projected bottles outside [wakeTime, cap); recorded bottles are never trimmed.
  const trimmedEvents = events.filter((e) => {
    if (!isBottle(e)) return true;
    if (!isProjected(e)) return true;
    if (isDreamFeed(e)) return true; // lives outside cap by design
    return e.startTime >= wakeTime && e.startTime < cap;
  });

  const bottles = trimmedEvents.filter(isBottle);
  const regions = napRegions(trimmedEvents);

  // Chain bottles: in-window, excluding dream-feed.
  const chainBottles = bottles
    .filter((b) => !isDreamFeed(b) && b.startTime >= wakeTime && b.startTime < cap)
    .sort((a, b) => a.startTime - b.startTime);
  const anchors = chainBottles.filter((b) => !isProjected(b));
  const isAnchored = anchors.length > 0;

  // Stable initial key index per pass; R5.4 renumbers the final set.
  const maxIndex = bottles.reduce((m, b) => {
    const idx = bottleIndexFromKey(b.eventKey);
    return idx !== null ? Math.max(m, idx) : m;
  }, 0);

  let nextIndex = maxIndex + 1;
  const projections: Event[] = [];
  let chainCount = chainBottles.length; // count chain only; overnight bottles don't consume daytime slots

  const snap = (proposed: number) => {
    const noNap = snapOutOfNap(proposed, regions, ctx.nowMinutes);
    const withPutdown = snapToPutdown(
      noNap,
      trimmedEvents,
      ctx.settings.putdownLeadMinutes,
      ctx.settings.defaultNapLengthMinutes,
      ctx.nowMinutes,
    );
    const outOfNap = snapOutOfNap(withPutdown, regions, ctx.nowMinutes);
    return snapForwardToNapEnd(outOfNap, regions, ctx.settings.putdownLeadMinutes, ctx.nowMinutes);
  };

  // Cold-start cap applies only when there are no morning anchors; once anchored,
  // the cascade runs to bedtime/midnight regardless of bottlesPerDay.
  const reachedColdStartCap = () => !isAnchored && chainCount >= target;

  // Overnight-near-wake guard: if an overnight bottle's forward interval
  // extends past wake+buffer, seed the cold-start cascade from that later time.
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

  // Forward cascade from the latest chain bottle; subsequent passes extend rather than re-emit.
  let prev: Event;
  if (chainBottles.length > 0) {
    prev = chainBottles[chainBottles.length - 1]!;
  } else {
    // Cold start: seed at seedTime (wake+buffer, shifted by overnight guard).
    if (reachedColdStartCap()) return [...trimmedEvents, ...projections];
    if (seedTime >= cap) return [...trimmedEvents, ...projections];
    const seed = snap(seedTime);
    if (seed >= cap) return [...trimmedEvents, ...projections];
    // Snap pushed seed before wakeTime (nap straddles wake-buffer); refuse to avoid trim loop.
    if (seed < wakeTime) return [...trimmedEvents, ...projections];
    const firstProj = buildProjectedBottle(ctx, nextIndex++, seed);
    projections.push(firstProj);
    chainCount++;
    prev = firstProj;
  }

  while (true) {
    if (reachedColdStartCap()) break;
    const interval = intervalForAmount(rules, prev.amountOz, defaultInterval);
    if (interval <= 0) break; // malformed rules; guard against infinite loop
    const proposed = prev.startTime + interval;
    if (proposed >= cap) break; // bedtime / midnight cap
    const placed = snap(proposed);
    if (placed >= cap) break;
    if (placed <= prev.startTime) break; // strict-monotonic guard against pathological snap loops
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
 * Renumbers bottle DISPLAY LABELS chronologically — the Nth bottle of the day
 * (by startTime) is "Bottle N", whether recorded or projected (DOMAIN.md §2,
 * EC-B3/EC-B4). Firestore eventKeys stay stable: recorded bottles keep their
 * pinned eventKey; projected bottles fill the slots after the highest recorded
 * number (so the owner-by-index mapping in R12.6 is unaffected). Engine-side
 * only — the label is a render concept, the eventKey is the persisted identity.
 */
const RuleRenumberBottlesChronologically: Rule = {
  id: "R5.4",
  description:
    "Renumber bottle labels chronologically (all bottles); projected eventKeys fill after max recorded, recorded eventKeys frozen",
  dependsOn: ["R5"],
  matches: (events) => {
    const target = computeRenumber(events);
    for (const b of bottlesByStartTime(events)) {
      const next = target.get(b.id);
      if (!next) continue;
      if (b.label !== next.label) return true;
      if (b.lifecycle.state === "projected" && b.eventKey !== next.eventKey) return true;
    }
    return false;
  },
  produces: (events) => {
    const target = computeRenumber(events);
    return events.map((e) => {
      if (!isBottle(e)) return e;
      if (isDreamFeed(e)) return e; // stable eventKey/label; renumber would break R5.5 identity check
      const next = target.get(e.id);
      if (!next) return e;
      if (e.lifecycle.state === "projected") {
        if (e.eventKey === next.eventKey && e.label === next.label) return e;
        return { ...e, eventKey: next.eventKey, label: next.label };
      }
      // Recorded: eventKey is the frozen Firestore identity; only the display label renumbers.
      if (e.label === next.label) return e;
      return { ...e, label: next.label };
    });
  },
};

/**
 * Maps bottle id → { eventKey, label }. Label is the 1-based chronological
 * position for every bottle. eventKey is the projected slot (after the highest
 * recorded number) for projected bottles, or the unchanged pinned key for
 * recorded bottles.
 */
function computeRenumber(events: Event[]): Map<string, { eventKey: string; label: string }> {
  const all = bottlesByStartTime(events);
  let maxRecorded = 0;
  for (const b of all) {
    if (b.lifecycle.state === "projected") continue;
    const idx = bottleIndexFromKey(b.eventKey);
    if (idx !== null && idx > maxRecorded) maxRecorded = idx;
  }
  let slot = maxRecorded + 1; // projected eventKeys start above every recorded number
  const result = new Map<string, { eventKey: string; label: string }>();
  let position = 1;
  for (const b of all) {
    const label = `Bottle ${position}`;
    if (b.lifecycle.state === "projected") {
      result.set(b.id, { eventKey: `bottle_${slot}`, label });
      slot++;
    } else {
      result.set(b.id, { eventKey: b.eventKey, label });
    }
    position++;
  }
  return result;
}

function bottlesByStartTime(events: Event[]): Event[] {
  // Exclude dream-feed; including it would shift rhythm-chain indices when its position changes.
  return events
    .filter(isBottle)
    .filter((b) => !isDreamFeed(b))
    .sort((a, b) => a.startTime - b.startTime);
}

// ---------------------------------------------------------------------------
// R5.5 — Dream-feed emission
// ---------------------------------------------------------------------------

/** True when a recorded post-bedtime bottle exists (suppresses the projected dream-feed slot). */
function hasRecordedPostBedtimeBottle(events: Event[]): boolean {
  const bedtime = events.find(isBedtime);
  if (!bedtime) return false;
  return events.some((e) => isBottle(e) && !isProjected(e) && e.startTime > bedtime.startTime);
}

/** Emits the projected dream-feed slot; suppressed when a recorded post-bedtime bottle exists. */
const RuleDreamFeedEmit: Rule = {
  id: "R5.5",
  description: "Emit projected dream-feed bottle at settings.dreamFeedTime",
  dependsOn: ["R5"],
  matches: (events, ctx) => {
    if (!ctx.settings.dreamFeedEnabled) return false;
    if (ctx.day.suppressedDreamFeed) return false; // drawer "delete" writes this field
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
