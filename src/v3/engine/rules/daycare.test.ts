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
    // Deterministic cascade: WW=110min, napLen=45, wake 7:00 →
    //   nap_1 8:50–9:35, nap_2 11:25–12:10, nap_3 14:00–14:45,
    //   nap_4 16:35–17:20.
    // Pickup nominal 17:00 falls inside nap_4 → expect shift to 17:20.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [110, 110, 110, 110, 120, 120],
        defaultNapLengthMinutes: 45,
        // bedtimeThreshold > nap_4 start so the 4th sleep stays a nap, not bedtime.
        bedtimeThreshold: 18 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 6 * 60, // pre-wake; no nap conflict
          pickupTime: 17 * 60,
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    const pickup = out.find((e) => e.type === "daycare_pickup");
    expect(pickup?.startTime).toBe(17 * 60 + 20);
  });

  it("recorded nap with no endTime: daycare shifts to nap.startTime + napLen", () => {
    // Repro of Jake's bug: user moves nap_1 start to 7:55 (just before
    // dropoff at 8:00). If the drawer leaves endTime undefined, raw
    // endTime is missing — earlier R21.2 silently skipped the shift.
    // Now: effectiveEndOf returns startTime + napLen as the base (=
    // 7:55 + 45 = 8:40), so daycare correctly shifts to 8:40.
    const recordedNap = {
      id: "rec_nap_1",
      dayId: "d1",
      eventKey: "nap_1",
      type: "nap" as const,
      kind: "block" as const,
      startTime: 7 * 60 + 55,
      // endTime intentionally OMITTED — mirrors the broken state the
      // drawer can leave a nap in after a start-time edit.
      label: "Nap 1",
      owner: NO_OWNER,
      hasPutdown: false,
      lifecycle: { state: "recorded" as const, annotatedAt: 7 * 60 + 55 },
    };
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      actuals: [recordedNap],
      // nowMinutes < nap.startTime + napLen so no auto-extend kicks in.
      nowMinutes: 8 * 60,
      settings: aSettings({
        wakeWindowsMinutes: [],
        defaultNapLengthMinutes: 45,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60, // inside [7:55, 8:40)
          pickupTime: 17 * 60 + 30,
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    const dropoff = out.find((e) => e.type === "daycare_dropoff");
    expect(dropoff?.startTime).toBe(7 * 60 + 55 + 45);
  });

  it("recorded daycare event is NOT shifted even if it lands inside a nap (reality-wins)", () => {
    // The engine's checkRealityWins invariant forbids any rule from
    // mutating a recorded event's time/owner/amount. If a user explicitly
    // records a handoff at 8:00 and a nap covers that time, R21.2 must
    // leave the recorded event alone — the user's commitment is canonical.
    const recordedPickup = {
      id: "recorded_daycare_pickup",
      dayId: "d1",
      eventKey: "daycare_pickup",
      type: "daycare_pickup" as const,
      kind: "instant" as const,
      startTime: 16 * 60 + 45, // inside the projected nap_4 window below
      label: "Daycare Pickup",
      owner: NO_OWNER,
      hasPutdown: false,
      lifecycle: { state: "recorded" as const, annotatedAt: 16 * 60 + 45 },
    };
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      actuals: [recordedPickup],
      settings: aSettings({
        wakeWindowsMinutes: [110, 110, 110, 110, 120, 120],
        defaultNapLengthMinutes: 45,
        bedtimeThreshold: 18 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 6 * 60, // pre-wake; no conflict
          pickupTime: 17 * 60, // nominal pickup is also irrelevant; the recorded one is what's evaluated
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    // Engine must not throw; recorded event passes through unchanged.
    expect(() => run(ctx)).not.toThrow();
    const out = run(ctx);
    const pickup = out.find((e) => e.id === "recorded_daycare_pickup")!;
    expect(pickup.startTime).toBe(16 * 60 + 45);
    expect(pickup.lifecycle.state).toBe("recorded");
  });

  it("rule is idempotent — running the engine twice produces the same shift", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [30, 120, 120, 120, 120, 120],
        defaultNapLengthMinutes: 45,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60,
          pickupTime: 17 * 60 + 30,
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const first = run(ctx);
    const second = run(ctx);
    expect(first.find((e) => e.type === "daycare_dropoff")?.startTime).toBe(8 * 60 + 15);
    expect(second.find((e) => e.type === "daycare_dropoff")?.startTime).toBe(8 * 60 + 15);
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
