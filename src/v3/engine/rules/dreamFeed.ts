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

import type { Event, OwnerRef } from "../../schemas";
import type { Rule } from "../evaluator";

const RuleProjectDreamFeed: Rule = {
  id: "R8",
  description: "Project a dream_feed instant after bedtime when enabled",
  dependsOn: ["R7.6"],
  matches: (events, ctx) => {
    if (!ctx.settings.dreamFeedEnabled) return false;
    if (events.some((e) => e.type === "dream_feed")) return false;
    return events.some((e) => e.type === "bedtime");
  },
  produces: (events, ctx) => {
    const bedtime = events.find((e) => e.type === "bedtime");
    if (!bedtime) return events;
    const dreamFeed = buildDreamFeed(bedtime, ctx);
    return [...events, dreamFeed];
  },
};

function buildDreamFeed(
  bedtime: Event,
  ctx: { day: { id: string }; settings: import("../../schemas").Settings },
): Event {
  const offset = ctx.settings.dreamFeedOffsetAfterBedtimeMinutes;
  const earliest = ctx.settings.dreamFeedStart;
  const latest = ctx.settings.dreamFeedEnd;
  const earliestAllowed = Math.max(bedtime.startTime + offset, earliest);
  const start = Math.min(earliestAllowed, latest);

  const event: Event = {
    id: "proj_dream_feed",
    dayId: ctx.day.id,
    eventKey: "dream_feed",
    type: "dream_feed",
    kind: "instant",
    startTime: start,
    label: "Dream Feed",
    hasPutdown: false,
    lifecycle: { state: "projected" },
    amountOz: ctx.settings.defaultBottleAmountOz,
  };
  const oppositeOwner = oppositeOf(bedtime.owner);
  if (oppositeOwner) event.owner = oppositeOwner;
  return event;
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
