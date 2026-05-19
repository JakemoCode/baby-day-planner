/**
 * R21.x — Daycare dropoff/pickup + auto-owner-assign.
 *
 * Source: docs/v3/ENGINE_SPEC.md §21.
 *
 * Implemented here:
 *   R21.1 — daycare_dropoff and daycare_pickup as instant events
 *   R21.2 — projection gated on daycare.enabled + today is a daycare
 *           weekday + Day.suppressedDaycareDay !== true
 *   R21.5 — Day.suppressedDaycareDay short-circuits projection (handled
 *           by R21.1's match condition)
 *
 * Removed (Daycare-as-window redesign, 2026-05-19):
 *   R21.3 — auto-assign daycare owner on window events.
 *   R21.7 — recorded events shifting the auto-assign window.
 *   The daycare concept is now a time-window attribute, not an owner.
 *   See §F41 for the visual indicator that will replace the deleted
 *   owner-stamping behavior.
 *
 * Out of scope here:
 *   R21.4 — dashboard CTA (UI / Phase 3)
 *   R21.6 — settings validation (UI / Phase 3)
 */

import { type Context, type Event, type OwnerRef, type TimeMin, type Weekday } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, projectedEvent } from "../helpers";

const isDaycareDropoff = hasType("daycare_dropoff");
const isDaycarePickup = hasType("daycare_pickup");

// ---------------------------------------------------------------------------
// R21.1 / R21.2 — Project daycare_dropoff and daycare_pickup
// ---------------------------------------------------------------------------

const RuleProjectDaycareEvents: Rule = {
  id: "R21.1",
  description:
    "Project daycare_dropoff and daycare_pickup when active today (R21.1 + R21.2 + R21.5)",
  matches: (events, ctx) => {
    if (!isDaycareActive(ctx)) return false;
    return !events.some(isDaycareDropoff) || !events.some(isDaycarePickup);
  },
  produces: (events, ctx) => {
    if (!isDaycareActive(ctx)) return events;
    // Dropoff/pickup events are owned by parent slots (the daycare owner
    // only owns events *between* dropoff and pickup — R21.3).
    const dropoffOwner: OwnerRef = { slot: ctx.settings.daycare.dropoffOwnerSlot };
    const pickupOwner: OwnerRef = { slot: ctx.settings.daycare.pickupOwnerSlot };
    const dropoff = events.some(isDaycareDropoff)
      ? []
      : [
          buildDaycareEvent(ctx, dropoffOwner, {
            id: "proj_daycare_dropoff",
            eventKey: "daycare_dropoff",
            type: "daycare_dropoff",
            label: "Daycare Dropoff",
            startTime: ctx.settings.daycare.dropoffTime,
          }),
        ];
    const pickup = events.some(isDaycarePickup)
      ? []
      : [
          buildDaycareEvent(ctx, pickupOwner, {
            id: "proj_daycare_pickup",
            eventKey: "daycare_pickup",
            type: "daycare_pickup",
            label: "Daycare Pickup",
            startTime: ctx.settings.daycare.pickupTime,
          }),
        ];
    return [...events, ...dropoff, ...pickup];
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DaycareEventSpec = {
  id: string;
  eventKey: string;
  type: "daycare_dropoff" | "daycare_pickup";
  label: string;
  startTime: TimeMin;
};

function buildDaycareEvent(ctx: Context, owner: OwnerRef, spec: DaycareEventSpec): Event {
  return projectedEvent({
    ctx,
    kind: "instant",
    owner,
    ...spec,
  });
}

/** Daycare is active for projection when enabled, today is a configured
 * weekday, and the day's suppression flag is off. Returns false when the
 * date can't be parsed — better to silently skip projection than crash
 * on a malformed Day.date value. */
function isDaycareActive(ctx: Context): boolean {
  const dc = ctx.settings.daycare;
  if (!dc.enabled) return false;
  if (ctx.day.suppressedDaycareDay) return false;
  const weekday = weekdayOf(ctx.day.date);
  if (!weekday) return false;
  return dc.weekdays[weekday];
}

const WEEKDAYS: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Parse an ISO date string to a Weekday, or null if the date is invalid.
 * Parses as UTC to avoid timezone-driven day-of-week drift; Day.date is
 * a local-day ISO string and the UTC midnight interpretation is stable
 * across timezones.
 */
function weekdayOf(isoDate: string): Weekday | null {
  const idx = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  if (Number.isNaN(idx)) return null;
  return WEEKDAYS[idx] ?? null;
}

export const RULES: Rule[] = [RuleProjectDaycareEvents];
