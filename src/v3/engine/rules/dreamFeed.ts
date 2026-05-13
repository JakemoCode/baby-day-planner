/**
 * R8.x — Dream feed rules.
 *
 * Source: docs/v3/REQUIREMENTS.md §8.
 *
 * R8.1: only emit when dreamFeedEnabled.
 * R8.2: only emit when a bedtime event exists.
 * R8.3: time = clamp(max(bedtime + offset, earliest), earliest, latest).
 * R8.4: a manual dream feed in actuals replaces the projection — handled
 *       by the rule's match condition checking event presence.
 * R8.8: owner defaults to the OPPOSITE of bedtime owner. If bedtime owner
 *       is `other`, dream feed has no default owner.
 */

import type { Context, Event, OwnerRef } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, projectedEvent } from "../helpers";

const isBedtime = hasType("bedtime");
const isDreamFeed = hasType("dream_feed");

const RuleProjectDreamFeed: Rule = {
  id: "R8.1",
  description: "Project a dream_feed instant after bedtime when enabled",
  // R3.1 (sleep cascade) emits the bedtime; R12.5 stamps the
  // template-driven bedtime owner. R8.8 (opposite-of-bedtime owner)
  // must observe both before computing the dream feed default.
  dependsOn: ["R3.1", "R12.5"],
  matches: (events, ctx) => {
    if (!ctx.settings.dreamFeedEnabled) return false;
    if (events.some(isDreamFeed)) return false;
    if (!events.some(isBedtime)) return false;
    const bedtime = events.find(isBedtime)!;
    return dreamFeedTime(bedtime, ctx) !== null;
  },
  produces: (events, ctx) => {
    const bedtime = events.find(isBedtime);
    if (!bedtime) return events;
    const time = dreamFeedTime(bedtime, ctx);
    if (time === null) return events;
    return [...events, buildDreamFeed(bedtime, ctx, time)];
  },
};

/**
 * R8.3: time = clamp(max(bedtime + offset, earliest), earliest, latest).
 *
 * Returns null when the clamped result would land at or before bedtime —
 * a causality inversion (bedtime far enough in the day that
 * `bedtime + offset > latest` pulls the dream feed earlier than bedtime).
 * Suppressing in that case is the predictive-lens choice: don't render a
 * "feed" event before the baby has even gone down.
 */
function dreamFeedTime(bedtime: Event, ctx: Context): number | null {
  const { dreamFeedOffsetAfterBedtimeMinutes, dreamFeedStart, dreamFeedEnd } = ctx.settings;
  const earliestAllowed = Math.max(
    bedtime.startTime + dreamFeedOffsetAfterBedtimeMinutes,
    dreamFeedStart,
  );
  const startTime = Math.min(earliestAllowed, dreamFeedEnd);
  if (startTime <= bedtime.startTime) return null;
  return startTime;
}

function buildDreamFeed(bedtime: Event, ctx: Context, startTime: number): Event {
  const owner = oppositeOf(bedtime.owner);
  return projectedEvent({
    ctx,
    id: "proj_dream_feed",
    eventKey: "dream_feed",
    type: "dream_feed",
    kind: "instant",
    startTime,
    label: "Dream Feed",
    amountOz: ctx.settings.defaultBottleAmountOz,
    ...(owner !== undefined ? { owner } : {}),
  });
}

/**
 * R8.8: opposite-of-bedtime-owner. Returns undefined when no default applies
 * (no bedtime owner, or bedtime owner is the `other` slot).
 */
function oppositeOf(owner: OwnerRef | undefined): OwnerRef | undefined {
  if (!owner) return undefined;
  if (owner.slot === "parent1") return { slot: "parent2" };
  if (owner.slot === "parent2") return { slot: "parent1" };
  return undefined; // other → no default
}

export const RULES: Rule[] = [RuleProjectDreamFeed];
