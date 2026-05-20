/**
 * R21.x — Daycare dropoff/pickup projection + nap-conflict shift.
 *
 * Source: docs/v3/ENGINE_SPEC.md §21.
 *
 * Implemented here:
 *   R21.1 — daycare_dropoff and daycare_pickup as instant events
 *           (gated on daycare.enabled + today is a daycare weekday +
 *           Day.suppressedDaycareDay !== true). Events project owner-less
 *           — the per-day owner assignment lives on the timeline picker.
 *   R21.2 — shift dropoff/pickup to nap.endTime when the nominal time
 *           falls inside any nap [startTime, endTime). Settings times
 *           are nominal; the engine adjusts so we never wake the baby
 *           for daycare and never miss a nap for pickup.
 *   R21.5 — Day.suppressedDaycareDay short-circuits projection (handled
 *           by R21.1's match condition)
 *
 * Removed (Daycare-as-window redesign, 2026-05-19):
 *   R21.3 — auto-assign daycare owner on window events.
 *   R21.7 — recorded events shifting the auto-assign window.
 *   The daycare concept is now a time-window attribute, not an owner.
 *
 * Removed (per-day owner redesign, 2026-05-20):
 *   Settings.daycare.{dropoffOwnerSlot,pickupOwnerSlot} stamping. Daycare
 *   events project with NO_OWNER; assignment is per-day via the drawer
 *   like any other event.
 *
 * Out of scope here:
 *   R21.4 — dashboard CTA (UI / Phase 3)
 *   R21.6 — settings validation (UI / Phase 3)
 */

import { NO_OWNER } from "../../schemas";
import { type Context, type Event, type OwnerRef, type TimeMin, type Weekday } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, projectedEvent } from "../helpers";

const isDaycareDropoff = hasType("daycare_dropoff");
const isDaycarePickup = hasType("daycare_pickup");
const isNap = hasType("nap");

// ---------------------------------------------------------------------------
// R21.1 — Project daycare_dropoff and daycare_pickup (owner-less)
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
    const dropoff = events.some(isDaycareDropoff)
      ? []
      : [
          buildDaycareEvent(ctx, NO_OWNER, {
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
          buildDaycareEvent(ctx, NO_OWNER, {
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
// R21.2 — Shift dropoff/pickup out of nap windows
// ---------------------------------------------------------------------------
//
// Settings.daycare.{dropoffTime,pickupTime} are *nominal*. If the nominal
// time falls inside a nap interval [startTime, endTime), shift the daycare
// event to the nap's endTime — we're not waking the baby up for daycare,
// and we're not making him miss a nap for pickup.
//
// Applies to PROJECTED daycare events only — once the parent records the
// actual handoff time, that recorded value is canonical and not shifted.

function findContainingNap(naps: Event[], startTime: TimeMin): Event | null {
  // If multiple naps somehow overlap (shouldn't happen, but defensive),
  // pick the one with the latest endTime so we shift past all of them.
  let latest: Event | null = null;
  for (const nap of naps) {
    const end = nap.endTime ?? nap.startTime;
    if (nap.startTime <= startTime && startTime < end) {
      if (!latest || (latest.endTime ?? latest.startTime) < end) latest = nap;
    }
  }
  return latest;
}

const RuleShiftDaycareOutOfNap: Rule = {
  id: "R21.2",
  description: "Shift daycare dropoff/pickup to end of nap if nominal time falls inside one",
  // R3.1 = nap projection — naps must be in the event pool before we
  // can detect overlap. R21.1 = daycare projection — daycare events must
  // exist before we can shift them.
  dependsOn: ["R3.1", "R21.1"],
  matches: (events) => {
    const daycareEvents = events.filter((e) => isDaycareDropoff(e) || isDaycarePickup(e));
    if (daycareEvents.length === 0) return false;
    const naps = events.filter(isNap);
    if (naps.length === 0) return false;
    return daycareEvents.some((dc) => {
      // Only adjust projected daycare events — once recorded, the actual
      // handoff time wins.
      if (dc.lifecycle.state !== "projected") return false;
      const containing = findContainingNap(naps, dc.startTime);
      return containing !== null && containing.endTime !== undefined;
    });
  },
  produces: (events) => {
    const naps = events.filter(isNap);
    return events.map((e) => {
      if (!(isDaycareDropoff(e) || isDaycarePickup(e))) return e;
      if (e.lifecycle.state !== "projected") return e;
      const containing = findContainingNap(naps, e.startTime);
      if (!containing || containing.endTime === undefined) return e;
      return { ...e, startTime: containing.endTime };
    });
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

export const RULES: Rule[] = [RuleProjectDaycareEvents, RuleShiftDaycareOutOfNap];
