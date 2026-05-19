/**
 * R21.x — Daycare dropoff/pickup as instant events.
 *
 * Coverage in this file:
 *   R21.1 — daycare_dropoff and daycare_pickup are instant events
 *   R21.2 — projection gated on enabled + weekday + not-suppressed
 *   R21.5 — Day.suppressedDaycareDay skips projection
 *
 * Removed (Daycare-as-window redesign, 2026-05-19):
 *   R21.3 — auto-assign daycare owner on window events.
 *   R21.7 — recorded events shifting the auto-assign window.
 * Daycare is now a time-window attribute, not an owner. See §F41 for
 * the visual indicator that replaces the deleted owner-stamping
 * behavior.
 */

import { describe, expect, it } from "vitest";
import { PARENT1, PARENT2, aContext, aDay, aSettings } from "../../__tests__/factories";
import { type Context, type Event, type WeekdayFlags } from "../../schemas";
import { projectDay } from "../projectDay";
import { ALL_RULES } from "./index";

const ALL_DAYS_TRUE: WeekdayFlags = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
};

const ALL_DAYS_FALSE: WeekdayFlags = {
  mon: false,
  tue: false,
  wed: false,
  thu: false,
  fri: false,
  sat: false,
  sun: false,
};

function run(ctx: Context): Event[] {
  return projectDay(
    {
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
      ...(ctx.template !== undefined ? { template: ctx.template } : {}),
    },
    { rules: [...ALL_RULES] },
  );
}

describe("R21.1 / R21.2 — daycare events project when enabled, weekday, not suppressed", () => {
  it("with enabled + Fri weekday true + not-suppressed → emits dropoff and pickup instants owned by their respective parent slots", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }), // Friday
      settings: aSettings({
        wakeWindowsMinutes: [],
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          dropoffOwnerSlot: "parent1",
          pickupOwnerSlot: "parent2",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    const dropoff = out.find((e) => e.type === "daycare_dropoff");
    const pickup = out.find((e) => e.type === "daycare_pickup");
    expect(dropoff).toBeDefined();
    expect(pickup).toBeDefined();
    expect(dropoff!.kind).toBe("instant");
    expect(pickup!.kind).toBe("instant");
    expect(dropoff!.startTime).toBe(8 * 60 + 30);
    expect(pickup!.startTime).toBe(17 * 60 + 30);
    expect(dropoff!.lifecycle.state).toBe("projected");
    expect(dropoff!.owner).toEqual(PARENT1);
    expect(pickup!.owner).toEqual(PARENT2);
  });

  it("dropoff and pickup parent slots can be swapped (Kelly-AM pattern)", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [],
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          dropoffOwnerSlot: "parent2",
          pickupOwnerSlot: "parent1",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    expect(out.find((e) => e.type === "daycare_dropoff")?.owner).toEqual(PARENT2);
    expect(out.find((e) => e.type === "daycare_pickup")?.owner).toEqual(PARENT1);
  });

  it("with enabled=false → no daycare events", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [],
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: false,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          dropoffOwnerSlot: "parent1",
          pickupOwnerSlot: "parent2",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    expect(out.find((e) => e.type === "daycare_dropoff")).toBeUndefined();
    expect(out.find((e) => e.type === "daycare_pickup")).toBeUndefined();
  });

  it("with weekday flag false for today → no daycare events", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }), // Fri
      settings: aSettings({
        wakeWindowsMinutes: [],
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          dropoffOwnerSlot: "parent1",
          pickupOwnerSlot: "parent2",
          weekdays: { ...ALL_DAYS_FALSE, mon: true }, // Fri NOT enabled
        },
      }),
    });
    const out = run(ctx);
    expect(out.find((e) => e.type === "daycare_dropoff")).toBeUndefined();
    expect(out.find((e) => e.type === "daycare_pickup")).toBeUndefined();
  });

  it("with Day.suppressedDaycareDay=true → no daycare events (R21.5)", () => {
    const ctx = aContext({
      day: aDay({
        wakeTime: 7 * 60,
        date: "2026-05-08",
        suppressedDaycareDay: true,
      }),
      settings: aSettings({
        wakeWindowsMinutes: [],
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          dropoffOwnerSlot: "parent1",
          pickupOwnerSlot: "parent2",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    expect(out.find((e) => e.type === "daycare_dropoff")).toBeUndefined();
    expect(out.find((e) => e.type === "daycare_pickup")).toBeUndefined();
  });
});

describe("R21 — defensive edge case", () => {
  it("malformed Day.date does NOT throw and silently skips daycare projection", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "not-a-date" }),
      settings: aSettings({
        wakeWindowsMinutes: [],
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          dropoffOwnerSlot: "parent1",
          pickupOwnerSlot: "parent2",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    expect(() => run(ctx)).not.toThrow();
    const out = run(ctx);
    expect(out.find((e) => e.type === "daycare_dropoff")).toBeUndefined();
    expect(out.find((e) => e.type === "daycare_pickup")).toBeUndefined();
  });
});
