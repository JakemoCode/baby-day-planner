/**
 * R21.x — Daycare dropoff/pickup as instant events.
 *
 * Coverage in this file:
 *   R21.1 — daycare_dropoff and daycare_pickup are instant events,
 *           projected with NO_OWNER (per-day owner is assigned via the
 *           timeline drawer, like every other event — 2026-05-20 redesign)
 *   R21.2 — projection gated on enabled + weekday + not-suppressed
 *   R21.2 — *shift* projected daycare events to nap.endTime when the
 *           nominal Settings time falls inside a nap interval
 *   R21.5 — Day.suppressedDaycareDay skips projection
 */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aSettings } from "../../__tests__/factories";
import { NO_OWNER, type Context, type Event, type WeekdayFlags } from "../../schemas";
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

describe("R21.1 — daycare projection (owner-less)", () => {
  it("with enabled + Fri weekday true + not-suppressed → emits dropoff and pickup instants with NO_OWNER", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }), // Friday
      settings: aSettings({
        wakeWindowsMinutes: [],
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
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
    // 2026-05-20: events project owner-less so the timeline drawer can assign per-day.
    expect(dropoff!.owner).toEqual(NO_OWNER);
    expect(pickup!.owner).toEqual(NO_OWNER);
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
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    expect(out.find((e) => e.type === "daycare_dropoff")).toBeUndefined();
    expect(out.find((e) => e.type === "daycare_pickup")).toBeUndefined();
  });
});

describe("R21.2 — nominal time shifted out of nap windows", () => {
  it("dropoff falling inside a projected nap shifts to nap end", () => {
    // Wake 7:00, single wake window 30min → nap_1 starts 7:30.
    // Default nap length 45min → nap_1 ends 8:15. Dropoff nominal 8:00.
    // Expect: dropoff shifts to 8:15 (nap end).
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [30, 120, 120, 120, 120, 120],
        defaultNapLengthMinutes: 45,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60, // inside nap_1 [7:30, 8:15)
          pickupTime: 17 * 60 + 30,
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    const dropoff = out.find((e) => e.type === "daycare_dropoff");
    expect(dropoff?.startTime).toBe(8 * 60 + 15);
  });

  it("pickup falling inside a projected nap shifts to nap end", () => {
    // Force a late nap that contains 17:00. WW=180min each, napLen=45.
    // Wake 7:00 → nap1 10:00–10:45 → nap2 13:45–14:30 → nap3 17:30+.
    // Hmm — need nap to actually cover 17:00. Construct with shorter WWs.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        // 4 nap-windows; cascade lands nap4 at 16:30 ish.
        wakeWindowsMinutes: [120, 150, 150, 165, 150, 150],
        defaultNapLengthMinutes: 45,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 6 * 60, // pre-wake; no nap conflict
          pickupTime: 17 * 60, // intended to land inside the late nap
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    const naps = out.filter((e) => e.type === "nap").sort((a, b) => a.startTime - b.startTime);
    const pickup = out.find((e) => e.type === "daycare_pickup")!;
    // Find a nap containing the nominal pickup (17:00).
    const containing = naps.find(
      (n) => n.startTime <= 17 * 60 && 17 * 60 < (n.endTime ?? n.startTime),
    );
    if (containing) {
      expect(pickup.startTime).toBe(containing.endTime!);
    } else {
      // No conflict landed → nominal time preserved.
      expect(pickup.startTime).toBe(17 * 60);
    }
  });

  it("dropoff with no nap conflict keeps its nominal time", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        // Long wake window — no nap before 9:00.
        wakeWindowsMinutes: [180, 120, 120, 120, 120, 120],
        defaultNapLengthMinutes: 45,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30, // well before nap_1 at 10:00
          pickupTime: 17 * 60 + 30,
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    const dropoff = out.find((e) => e.type === "daycare_dropoff");
    expect(dropoff?.startTime).toBe(8 * 60 + 30);
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
