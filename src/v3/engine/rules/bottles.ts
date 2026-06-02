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

type CascadeInputs = {
  wakeTime: number;
  cap: number;
  seedTime: number;
  /** Recorded chain bottles in [wakeTime, cap), sorted ascending. */
  anchors: Event[];
  snap: (proposed: number) => number;
};

/** Shared setup so canCascade + projectBottleChain compute the identical schedule. */
function bottleCascadeInputs(events: Event[], ctx: Context): CascadeInputs | null {
  const wakeTime = ctx.day.wakeTime;
  if (wakeTime === undefined) return null;
  const cap = forwardCapFor(events);
  const wakeBuffer = wakeTime + ctx.settings.bottleChain.bufferAfterWakeMinutes;
  const defaultInterval = ctx.settings.defaultBottleIntervalMinutes;
  const rules = ctx.settings.bottleIntervalRules;
  const regions = napRegions(events);

  const snap = (proposed: number) => {
    const noNap = snapOutOfNap(proposed, regions, ctx.nowMinutes);
    const withPutdown = snapToPutdown(
      noNap,
      events,
      ctx.settings.putdownLeadMinutes,
      ctx.settings.defaultNapLengthMinutes,
      ctx.nowMinutes,
    );
    const outOfNap = snapOutOfNap(withPutdown, regions, ctx.nowMinutes);
    return snapForwardToNapEnd(outOfNap, regions, ctx.settings.putdownLeadMinutes, ctx.nowMinutes);
  };

  const anchors = events
    .filter(
      (b) =>
        isBottle(b) &&
        !isProjected(b) &&
        !isDreamFeed(b) &&
        b.startTime >= wakeTime &&
        b.startTime < cap,
    )
    .sort((a, b) => a.startTime - b.startTime);

  // Overnight-near-wake guard (§F54): if an overnight bottle's forward interval
  // extends past wake+buffer, seed the cascade from that later time instead.
  const overnight = events
    .filter((b) => isBottle(b) && !isProjected(b) && b.startTime < wakeTime)
    .sort((a, b) => a.startTime - b.startTime)
    .at(-1);
  const overnightSeed =
    overnight !== undefined
      ? overnight.startTime + intervalForAmount(rules, overnight.amountOz, defaultInterval)
      : undefined;
  const seedTime =
    overnightSeed !== undefined && overnightSeed > wakeBuffer ? overnightSeed : wakeBuffer;

  return { wakeTime, cap, seedTime, anchors, snap };
}

/**
 * Full-day projected bottle TIMES: walk wake+buffer → cap at cadence. When the
 * cursor reaches a recorded bottle, the cascade RE-SEEDS forward from it (R5.1).
 * An ordinary recorded bottle (FAB-add extra) never absorbs a forecast slot
 * (ENGINE_SPEC §R5.1/5.9) — it re-cascades the forecast forward and keeps its own
 * chronological number; earlier forecast slots survive. The ONE exception is a
 * bottle tagged `realizedForecast` (a drawer edit of a projection, BOTTLE_SPEC §4):
 * it absorbs the imminent slot it realized so editing a forecast moves it rather
 * than duplicating it. Recorded anchors are
 * NOT returned — only projection times. Deterministic in (anchors, settings) ⇒
 * idempotent across evaluator passes. Fills the whole day to the time cap (no
 * count cap), so morning forecasts survive a later recorded bottle (§F66, no persist-on-view).
 */
function computeBottleProjectionTimes(inputs: CascadeInputs, ctx: Context): number[] {
  const { wakeTime, cap, seedTime, anchors, snap } = inputs;
  const defaultInterval = ctx.settings.defaultBottleIntervalMinutes;
  const rules = ctx.settings.bottleIntervalRules;
  // Projections carry the default amount, so they advance by the default amount's
  // interval (which the rules may shorten/lengthen) — not the raw default minutes.
  const projInterval = intervalForAmount(
    rules,
    ctx.settings.defaultBottleAmountOz,
    defaultInterval,
  );

  // The cursor has reached this recorded bottle → re-seed the forecast forward from
  // it. NO look-ahead absorption: a recorded feed never deletes an earlier forecast
  // slot (ENGINE_SPEC §R5.1/5.9 — the #300 absorption window was a rejected deviation).
  const anchorReached = (t: number, anchor: Event | undefined): boolean =>
    anchor !== undefined && anchor.startTime <= t;

  const times: number[] = [];
  let cursor = seedTime;
  let anchorIdx = 0;
  let lastPlaced = wakeTime - 1;
  // Re-seed the cascade forward from a consumed anchor (re-flow at its amount's interval).
  const consume = (a: Event): void => {
    cursor = a.startTime + intervalForAmount(rules, a.amountOz, defaultInterval);
    lastPlaced = a.startTime;
    anchorIdx++;
  };
  for (let guard = 0; cursor < cap && guard < 64; guard++) {
    const anchor = anchors[anchorIdx];
    if (anchorReached(cursor, anchor)) {
      consume(anchor!);
      continue;
    }
    const placed = snap(cursor);
    if (placed >= cap || placed < wakeTime || placed <= lastPlaced) break;
    if (anchorReached(placed, anchor)) {
      consume(anchor!);
      continue;
    }
    // Realize/relocate (BOTTLE_SPEC §4): absorb the imminent slot a realized bottle
    // moved (the one adjacent to it), instead of re-emitting it beside the feed.
    if (anchor?.realizedForecast === true && placed >= anchor.startTime - projInterval) {
      consume(anchor);
      continue;
    }
    times.push(placed);
    lastPlaced = placed;
    cursor = placed + projInterval;
  }
  return times;
}

/**
 * Fires when materialized bottle projections differ from the full-day schedule
 * (something to add, remove, or re-place); false at the fixed point.
 */
function canCascade(events: Event[], ctx: Context): boolean {
  const inputs = bottleCascadeInputs(events, ctx);
  if (inputs === null) return false;
  const { wakeTime, cap } = inputs;
  // Any projected non-dream bottle outside the window is stale → recompute.
  const hasStale = events.some(
    (b) =>
      isBottle(b) &&
      isProjected(b) &&
      !isDreamFeed(b) &&
      (b.startTime < wakeTime || b.startTime >= cap),
  );
  if (hasStale) return true;
  const want = computeBottleProjectionTimes(inputs, ctx).sort((a, b) => a - b);
  const current = events
    .filter((b) => isBottle(b) && isProjected(b) && !isDreamFeed(b))
    .map((b) => b.startTime)
    .sort((a, b) => a - b);
  if (current.length !== want.length) return true;
  return current.some((t, i) => t !== want[i]);
}

function projectBottleChain(events: Event[], ctx: Context): Event[] {
  const inputs = bottleCascadeInputs(events, ctx);
  if (inputs === null) return events;

  // Recompute ALL projected non-dream bottles from the anchors (pure ⇒ idempotent).
  // Recorded bottles, dream-feed, and non-bottle events pass through untouched.
  const kept = events.filter((e) => !(isBottle(e) && isProjected(e) && !isDreamFeed(e)));
  const times = computeBottleProjectionTimes(inputs, ctx);

  // Stable initial key index; R5.4 renumbers the final set chronologically.
  const maxIndex = kept.filter(isBottle).reduce((m, b) => {
    const idx = bottleIndexFromKey(b.eventKey);
    return idx !== null ? Math.max(m, idx) : m;
  }, 0);
  let nextIndex = maxIndex + 1;

  const projections = times.map((t) => buildProjectedBottle(ctx, nextIndex++, t));
  return [...kept, ...projections];
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
