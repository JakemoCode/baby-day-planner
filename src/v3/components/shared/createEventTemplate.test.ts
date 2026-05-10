/**
 * createEventTemplate seeds a projected V3 Event for the FAB-driven
 * "add event" flow. The drawer then promotes it to the right lifecycle
 * state at save (formToEvent decides — projected → completed/started/
 * overridden based on what the user changes).
 *
 * Sequential eventKeys (`bottle_N`, `nap_N`) anchor the engine's
 * cascade so chained types continue forecasting from the new event.
 */

import { describe, expect, it } from "vitest";
import type { Event, Settings } from "../../schemas";
import { buildCreateTemplate } from "./createEventTemplate";

const NOW = 7 * 60 + 30;

const settings = (overrides: Partial<Settings> = {}): Settings =>
  ({
    childId: "child-1",
    defaultWakeTime: 7 * 60,
    bedtimeThreshold: 19 * 60,
    defaultNapLengthMinutes: 90,
    shortNapThresholdMinutes: 45,
    shortNapAdjustmentMinutes: 30,
    wakeWindowsMinutes: [120, 150, 180],
    napDurationMin: 30,
    napDurationMax: 180,
    defaultBottleAmountOz: 5,
    defaultBottleIntervalMinutes: 180,
    bottleRules: [],
    bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
    minBottleIntervalMinutes: 90,
    putdownLeadMinutes: 15,
    pumpTimes: [],
    pumpOwnerSlot: "parent2",
    dreamFeedEnabled: false,
    dreamFeedStart: 22 * 60,
    dreamFeedEnd: 23 * 60,
    dreamFeedOffsetAfterBedtimeMinutes: 180,
    dailyRecurring: [],
    daycare: {
      enabled: false,
      dropoffTime: 8 * 60,
      pickupTime: 17 * 60,
      ownerId: "daycare",
      weekdays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    },
    owners: {
      parent1: { displayName: "Jake", color: "#0af" },
      parent2: { displayName: "Sam", color: "#f0a" },
      other: [],
    },
    timelinePxPerHour: 80,
    timelineDimPast: true,
    ...overrides,
  }) satisfies Settings;

const recordedBottle = (n: number, startTime: number): Event => ({
  id: `bottle-${n}`,
  dayId: "d-1",
  eventKey: `bottle_${n}`,
  type: "bottle",
  kind: "instant",
  startTime,
  label: `Bottle ${n}`,
  amountOz: 5,
  hasPutdown: false,
  lifecycle: { state: "completed", committedAt: startTime },
});

describe("buildCreateTemplate (V3)", () => {
  it("seeds a bottle template with TimeMin startTime + projected lifecycle", () => {
    const tpl = buildCreateTemplate({
      type: "bottle",
      dayId: "d-1",
      actuals: [],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.type).toBe("bottle");
    expect(tpl.kind).toBe("instant");
    expect(tpl.startTime).toBe(NOW);
    expect(tpl.amountOz).toBe(5);
    expect(tpl.lifecycle).toEqual({ state: "projected" });
    expect(tpl.hasPutdown).toBe(false);
  });

  it("numbers a new bottle by counting recorded bottles", () => {
    const actuals = [recordedBottle(1, 7 * 60), recordedBottle(2, 10 * 60)];
    const tpl = buildCreateTemplate({
      type: "bottle",
      dayId: "d-1",
      actuals,
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.eventKey).toBe("bottle_3");
    expect(tpl.label).toBe("Bottle 3");
  });

  it("ignores projected bottles when numbering — agrees with uniqueRecordedKeys", () => {
    // 1 recorded + 1 projected → next ordinal is 2, NOT 3. Without the
    // lifecycle filter the FAB path drifts ahead of StartBottleButton.
    const projectedBottle: Event = {
      id: "b-proj",
      dayId: "d-1",
      eventKey: "bottle_2",
      type: "bottle",
      kind: "instant",
      startTime: 11 * 60,
      label: "Bottle 2",
      amountOz: 5,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
    const tpl = buildCreateTemplate({
      type: "bottle",
      dayId: "d-1",
      actuals: [recordedBottle(1, 7 * 60), projectedBottle],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.eventKey).toBe("bottle_2");
    expect(tpl.label).toBe("Bottle 2");
  });

  it("seeds a nap template as block-kind without endTime (drawer fills end)", () => {
    const tpl = buildCreateTemplate({
      type: "nap",
      dayId: "d-1",
      actuals: [],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.type).toBe("nap");
    expect(tpl.kind).toBe("block");
    expect(tpl.endTime).toBeUndefined();
    expect(tpl.eventKey).toBe("nap_1");
    expect(tpl.lifecycle).toEqual({ state: "projected" });
  });

  it("numbers a new nap by counting recorded naps", () => {
    const recordedNap: Event = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      startTime: 9 * 60,
      endTime: 10 * 60,
      label: "Nap 1",
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 10 * 60 },
    };
    const tpl = buildCreateTemplate({
      type: "nap",
      dayId: "d-1",
      actuals: [recordedNap],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.eventKey).toBe("nap_2");
    expect(tpl.label).toBe("Nap 2");
  });

  it("seeds a pump template (instant) with a unique eventKey", () => {
    const tpl = buildCreateTemplate({
      type: "pump",
      dayId: "d-1",
      actuals: [],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.type).toBe("pump");
    expect(tpl.kind).toBe("instant");
    expect(tpl.eventKey).toMatch(/^pump_/);
    expect(tpl.startTime).toBe(NOW);
  });

  it("seeds an extra template (block) with empty label so the drawer prompts for one", () => {
    const tpl = buildCreateTemplate({
      type: "extra",
      dayId: "d-1",
      actuals: [],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.type).toBe("extra");
    expect(tpl.kind).toBe("block");
    expect(tpl.label).toBe("");
  });

  it("never sets owner on a freshly seeded template (drawer picks)", () => {
    for (const t of ["bottle", "nap", "pump", "extra"] as const) {
      const tpl = buildCreateTemplate({
        type: t,
        dayId: "d-1",
        actuals: [],
        settings: settings(),
        nowMinutes: NOW,
      });
      expect(tpl.owner).toBeUndefined();
    }
  });
});
