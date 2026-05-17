/**
 * R21.x — Daycare dropoff/pickup + auto-owner-assign.
 *
 * Tests-first per CLAUDE.md TDD protocol.
 *
 * Coverage in this file:
 *   R21.1 — daycare_dropoff and daycare_pickup are instant events
 *   R21.2 — projection gated on enabled + weekday + not-suppressed
 *   R21.3 — projected naps/bottles inside [dropoff, pickup) auto-assign
 *           the daycare owner (unless template / recorded already set one)
 *   R21.5 — Day.suppressedDaycareDay skips projection
 *   R21.7 — recorded daycare events drive the auto-assign window
 *
 * Out of scope here:
 *   R21.4 — dashboard CTA (UI / Phase 3)
 *   R21.6 — settings validation (UI / Phase 3)
 */

import { describe, expect, it } from "vitest";
import {
  PARENT1,
  PARENT2,
  aContext,
  aDay,
  aSettings,
  aTemplate,
  otherOwner,
} from "../../__tests__/factories";
import type { Context, Event, WeekdayFlags } from "../../schemas";
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

const DAYCARE = otherOwner("daycare");

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
  it("with enabled + Fri weekday true + not-suppressed → emits dropoff and pickup instants", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }), // Friday
      settings: aSettings({
        wakeWindowsMinutes: [], // disable nap chain to keep the assertion focused
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          ownerId: "daycare",
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
    expect(dropoff!.owner).toEqual(DAYCARE);
    expect(pickup!.owner).toEqual(DAYCARE);
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
          ownerId: "daycare",
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
          ownerId: "daycare",
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
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    expect(out.find((e) => e.type === "daycare_dropoff")).toBeUndefined();
    expect(out.find((e) => e.type === "daycare_pickup")).toBeUndefined();
  });
});

describe("R21.3 — projected naps/bottles inside the window auto-assign daycare owner", () => {
  it("projected naps with no template inherit daycare owner inside [dropoff, pickup)", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });

    const out = run(ctx);
    const naps = out.filter((e) => e.type === "nap").sort((a, b) => a.startTime - b.startTime);
    // Expected default cascade puts naps roughly 9:00, 12:15, 15:30, ~19+.
    // First three are inside [8:30, 17:30) → daycare owner.
    // Fourth lands at/after 17:30, no auto-assign.
    expect(naps[0]!.owner).toEqual(DAYCARE);
    expect(naps[1]!.owner).toEqual(DAYCARE);
    expect(naps[2]!.owner).toEqual(DAYCARE);
    if (naps[3]) {
      expect(naps[3]!.owner).toBeUndefined();
    }
  });

  it("template-assigned nap owner takes precedence over daycare auto-assign", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
      template: aTemplate({
        napOwners: [PARENT1, PARENT1, PARENT1, PARENT1],
      }),
    });

    const out = run(ctx);
    const naps = out.filter((e) => e.type === "nap");
    // Template wins — every nap is PARENT1, even those inside the window.
    expect(naps.every((n) => n.owner !== undefined && n.owner.slot === "parent1")).toBe(true);
  });

  it("recorded nap with explicit owner stays unchanged (reality wins)", () => {
    const recorded: Event = {
      id: "actual_nap_2",
      dayId: "day_test",
      eventKey: "nap_2",
      type: "nap",
      kind: "block",
      startTime: 12 * 60,
      endTime: 13 * 60,
      label: "Nap",
      owner: PARENT2,
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 12 * 60 },
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
      actuals: [recorded],
    });

    const out = run(ctx);
    const napTwo = out.find((e) => e.id === recorded.id);
    expect(napTwo?.owner).toEqual(PARENT2); // recorded owner preserved
  });

  it("naps outside the daycare window do NOT get daycare owner", () => {
    // Cascade puts nap_1 at 9:00. Set dropoff to 10:00 so nap_1 is BEFORE the window.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 10 * 60,
          pickupTime: 17 * 60 + 30,
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });

    const out = run(ctx);
    const napOne = out.find((e) => e.eventKey === "nap_1");
    expect(napOne?.startTime).toBe(9 * 60);
    expect(napOne?.owner).toBeUndefined(); // nap_1 (9:00) is before 10:00 dropoff
  });
});

describe("R21 — defensive edge cases", () => {
  it("zero-width window (dropoff === pickup) auto-assigns nothing", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 12 * 60,
          pickupTime: 12 * 60,
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    const naps = out.filter((e) => e.type === "nap");
    expect(naps.every((n) => n.owner === undefined)).toBe(true);
  });

  it("inverted window (dropoff > pickup) auto-assigns nothing (data-integrity safety)", () => {
    // R21.6 says invalid configuration blocks save in the UI. If a malformed
    // Firestore doc reaches the engine, treat it as "no window" rather than
    // stamping daycare owner on morning naps.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 17 * 60,
          pickupTime: 8 * 60,
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    const naps = out.filter((e) => e.type === "nap");
    expect(naps.every((n) => n.owner === undefined)).toBe(true);
  });

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
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    expect(() => run(ctx)).not.toThrow();
    const out = run(ctx);
    expect(out.find((e) => e.type === "daycare_dropoff")).toBeUndefined();
    expect(out.find((e) => e.type === "daycare_pickup")).toBeUndefined();
  });

  it("overridden nap with cleared owner is NOT re-stamped by R21.3", () => {
    const overriddenNap: Event = {
      id: "overridden_nap_2",
      dayId: "day_test",
      eventKey: "nap_2",
      type: "nap",
      kind: "block",
      startTime: 12 * 60, // inside [8:30, 17:30) window
      endTime: 13 * 60,
      label: "Nap 2",
      hasPutdown: false,
      lifecycle: { state: "recorded", annotatedAt: 11 * 60 },
      // owner omitted — user explicitly cleared
    };
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
      actuals: [overriddenNap],
    });
    const out = run(ctx);
    const napTwo = out.find((e) => e.id === overriddenNap.id);
    expect(napTwo?.owner).toBeUndefined();
    expect(napTwo?.lifecycle.state).toBe("recorded");
  });
});

describe("R21.7 — recorded daycare events shift the auto-assign window", () => {
  it("if user records a daycare_pickup EARLIER than projected, naps after the recorded pickup are NOT auto-assigned", () => {
    // Symmetric to the dropoff test: recorded pickup at 14:00 (vs projected
    // 17:30) means naps between 14:00 and 17:30 lose their auto-assign.
    const recordedPickup: Event = {
      id: "actual_pickup",
      dayId: "day_test",
      eventKey: "daycare_pickup",
      type: "daycare_pickup",
      kind: "instant",
      startTime: 14 * 60,
      label: "Daycare Pickup",
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 14 * 60 },
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30,
          pickupTime: 17 * 60 + 30,
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
      actuals: [recordedPickup],
    });

    const out = run(ctx);
    // nap_2 at ~12:15 is BEFORE 14:00 → daycare owner.
    expect(out.find((e) => e.eventKey === "nap_2")?.owner).toEqual(DAYCARE);
    // nap_3 at ~15:30 is AFTER recorded pickup → no daycare owner.
    expect(out.find((e) => e.eventKey === "nap_3")?.owner).toBeUndefined();
  });

  it("if user records a daycare_dropoff at 9:30, naps before 9:30 are NOT auto-assigned", () => {
    const recordedDropoff: Event = {
      id: "actual_dropoff",
      dayId: "day_test",
      eventKey: "daycare_dropoff",
      type: "daycare_dropoff",
      kind: "instant",
      startTime: 9 * 60 + 30, // recorded later than projected 8:30
      label: "Daycare Dropoff",
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 9 * 60 + 30 },
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30, // setting says 8:30; actual recording is 9:30
          pickupTime: 17 * 60 + 30,
          ownerId: "daycare",
          weekdays: ALL_DAYS_TRUE,
        },
      }),
      actuals: [recordedDropoff],
    });

    const out = run(ctx);
    const napOne = out.find((e) => e.eventKey === "nap_1"); // 9:00, before 9:30 recorded dropoff
    expect(napOne?.owner).toBeUndefined();

    const napTwo = out.find((e) => e.eventKey === "nap_2"); // ~12:15, inside window
    expect(napTwo?.owner).toEqual(DAYCARE);
  });
});
