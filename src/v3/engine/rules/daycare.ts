/**
 * R21.1 — Project daycare_dropoff/pickup (owner-less) when active today.
 * R21.2 — Shift to nap.endTime when nominal time falls inside a nap.
 * R21.5 — Day.suppressedDaycareDay blocks projection.
 */

import { NO_OWNER } from "../../schemas";
import { type Context, type Event, type OwnerRef, type TimeMin, type Weekday } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, isNap, projectedEvent } from "../helpers";
import {
  DAYCARE_DROPOFF_EVENT_KEY,
  DAYCARE_PICKUP_EVENT_KEY,
  ENGINE_PROJECTED_ID_PREFIX,
} from "../../lib/eventConventions";

const isDaycareDropoff = hasType("daycare_dropoff");
const isDaycarePickup = hasType("daycare_pickup");

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
            id: `${ENGINE_PROJECTED_ID_PREFIX}${DAYCARE_DROPOFF_EVENT_KEY}`,
            eventKey: DAYCARE_DROPOFF_EVENT_KEY,
            type: DAYCARE_DROPOFF_EVENT_KEY,
            label: "Daycare Dropoff",
            startTime: ctx.settings.daycare.dropoffTime,
          }),
        ];
    const pickup = events.some(isDaycarePickup)
      ? []
      : [
          buildDaycareEvent(ctx, NO_OWNER, {
            id: `${ENGINE_PROJECTED_ID_PREFIX}${DAYCARE_PICKUP_EVENT_KEY}`,
            eventKey: DAYCARE_PICKUP_EVENT_KEY,
            type: DAYCARE_PICKUP_EVENT_KEY,
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
// Settings times are nominal. Applies to projected events only; recorded
// daycare times are user-committed and protected by the reality-wins invariant.

function napEnd(nap: Event, ctx: Context): TimeMin {
  return nap.endTime ?? nap.startTime + ctx.settings.defaultNapLengthMinutes;
}

function findContainingNap(naps: Event[], startTime: TimeMin, ctx: Context): Event | null {
  // Pick the latest-ending overlapping nap (defensive against overlap) so we shift past all of them.
  let latest: Event | null = null;
  let latestEnd = -Infinity;
  for (const nap of naps) {
    const end = napEnd(nap, ctx);
    if (nap.startTime <= startTime && startTime < end) {
      if (end > latestEnd) {
        latest = nap;
        latestEnd = end;
      }
    }
  }
  return latest;
}

const RuleShiftDaycareOutOfNap: Rule = {
  id: "R21.2",
  description: "Shift daycare dropoff/pickup to end of nap if nominal time falls inside one",
  dependsOn: ["R3.1", "R21.1"],
  matches: (events, ctx) => {
    const daycareEvents = events.filter((e) => isDaycareDropoff(e) || isDaycarePickup(e));
    if (daycareEvents.length === 0) return false;
    const naps = events.filter(isNap);
    if (naps.length === 0) return false;
    return daycareEvents.some((dc) => {
      if (dc.lifecycle.state !== "projected") return false;
      const containing = findContainingNap(naps, dc.startTime, ctx);
      if (!containing) return false;
      return napEnd(containing, ctx) !== dc.startTime; // fire only when shift would change something
    });
  },
  produces: (events, ctx) => {
    const naps = events.filter(isNap);
    return events.map((e) => {
      if (!(isDaycareDropoff(e) || isDaycarePickup(e))) return e;
      if (e.lifecycle.state !== "projected") return e;
      const containing = findContainingNap(naps, e.startTime, ctx);
      if (!containing) return e;
      return { ...e, startTime: napEnd(containing, ctx) };
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

/** True when daycare is enabled, today is a configured weekday, and the suppression flag is off. */
function isDaycareActive(ctx: Context): boolean {
  const dc = ctx.settings.daycare;
  if (!dc.enabled) return false;
  if (ctx.day.suppressedDaycareDay) return false;
  const weekday = weekdayOf(ctx.day.date);
  if (!weekday) return false;
  return dc.weekdays[weekday];
}

const WEEKDAYS: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Parse ISO date to Weekday; uses UTC midnight to avoid timezone-driven day-of-week drift. */
function weekdayOf(isoDate: string): Weekday | null {
  const idx = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  if (Number.isNaN(idx)) return null;
  return WEEKDAYS[idx] ?? null;
}

export const RULES: Rule[] = [RuleProjectDaycareEvents, RuleShiftDaycareOutOfNap];
