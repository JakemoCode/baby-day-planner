/**
 * R21.x — Daycare dropoff/pickup + auto-owner-assign.
 *
 * Source: docs/v3/REQUIREMENTS.md §21.
 *
 * Implemented here:
 *   R21.1 — daycare_dropoff and daycare_pickup as instant events
 *   R21.2 — projection gated on daycare.enabled + today is a daycare
 *           weekday + Day.suppressedDaycareDay !== true
 *   R21.3 — projected naps/bottles inside the [dropoff, pickup) window
 *           auto-assign the daycare owner UNLESS template/recorded already
 *           supplied one (gate on `e.owner === undefined`)
 *   R21.5 — Day.suppressedDaycareDay short-circuits projection (handled
 *           by R21.1's match condition)
 *   R21.7 — recorded daycare events drive the window (dedup by eventKey
 *           leaves recorded events as the only daycare_* in `events`,
 *           and R21.3 reads `startTime` from whichever event is present)
 *
 * Out of scope here:
 *   R21.4 — dashboard CTA (UI / Phase 3)
 *   R21.6 — settings validation (UI / Phase 3)
 */

import type { Context, Event, OwnerRef, TimeMin, Weekday } from "../../schemas";
import type { Rule } from "../evaluator";
import { hasType, isProjected, projectedEvent } from "../helpers";

const isDaycareDropoff = hasType("daycare_dropoff");
const isDaycarePickup = hasType("daycare_pickup");
const isNap = hasType("nap");
const isBottle = hasType("bottle");

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
    const owner = daycareOwner(ctx);
    const dropoff = events.some(isDaycareDropoff)
      ? []
      : [
          buildDaycareEvent(ctx, owner, {
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
          buildDaycareEvent(ctx, owner, {
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
// R21.3 — Auto-assign daycare owner to projected nap/bottle in the window
// ---------------------------------------------------------------------------

const RuleAssignDaycareWindowOwner: Rule = {
  id: "R21.3",
  description:
    "Stamp daycare owner on projected naps/bottles whose start falls in [dropoff, pickup)",
  // Run after R3.1 so nap times are settled, after R5.4 so bottle order
  // is chronological, after R21.1 so the daycare events are present, and
  // after the template-owner rules so template precedence works via
  // `owner === undefined` gating. R5.4 is reachable transitively through
  // R12.6 and R3.1 through R12.2, but listing them explicitly makes the
  // intent visible to a future reader.
  dependsOn: ["R3.1", "R5.4", "R21.1", "R12.2", "R12.6"],
  matches: (events, ctx) => {
    const window = activeDaycareWindow(events, ctx);
    if (!window) return false;
    return events.some((e) => isWindowCandidate(e, window));
  },
  produces: (events, ctx) => {
    const window = activeDaycareWindow(events, ctx);
    if (!window) return events;
    const owner = daycareOwner(ctx);
    return events.map((e) => (isWindowCandidate(e, window) ? { ...e, owner } : e));
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

type Window = { start: TimeMin; end: TimeMin };

/**
 * Returns the active daycare window — or null when daycare is inactive,
 * the events lack both endpoints, or the window is zero-width / inverted.
 * R21.7: reads from the actual events in `events` rather than settings,
 * so a recorded daycare_dropoff at 9:30 shifts the window even if
 * settings still say 8:30.
 *
 * Zero-width / inverted (`start >= end`) is a malformed-config safety
 * net per R21.6. The UI blocks save in that state, but a corrupt
 * Firestore doc shouldn't make morning naps inherit daycare ownership.
 */
function activeDaycareWindow(events: Event[], ctx: Context): Window | null {
  if (!isDaycareActive(ctx)) return null;
  const dropoff = events.find(isDaycareDropoff);
  const pickup = events.find(isDaycarePickup);
  if (!dropoff || !pickup) return null;
  if (dropoff.startTime >= pickup.startTime) return null;
  return { start: dropoff.startTime, end: pickup.startTime };
}

function isWindowCandidate(e: Event, window: Window): boolean {
  if (!isNap(e) && !isBottle(e)) return false;
  if (!isProjected(e)) return false;
  if (e.owner !== undefined) return false;
  return e.startTime >= window.start && e.startTime < window.end;
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

function daycareOwner(ctx: Context): OwnerRef {
  return { slot: "other", otherId: ctx.settings.daycare.ownerId };
}

export const RULES: Rule[] = [RuleProjectDaycareEvents, RuleAssignDaycareWindowOwner];
