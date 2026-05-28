/**
 * createEventTemplate seeds a projected V3 Event for the FAB "add event" flow.
 * Sequential eventKeys (`bottle_N`, `nap_N`) anchor the engine cascade.
 */

import { describe, expect, it } from "vitest";
import type { Event, Settings } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { aSettings } from "../../__tests__/factories";
import { buildCreateTemplate } from "./createEventTemplate";

const NOW = 7 * 60 + 30;

const settings = (overrides: Partial<Settings> = {}): Settings =>
  aSettings({ childId: "child-1", ...overrides });

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
  owner: NO_OWNER,
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
    // 1 recorded + 1 projected → next ordinal is 2, not 3; lifecycle filter keeps FAB in sync.
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
      owner: NO_OWNER,
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

  it("with projected[] passed, picks max(eventKey N) + 1 across actuals + projected", () => {
    // engine projected bottle_5 + only bottle_1 recorded → new template must claim bottle_6, not bottle_2.
    const projectedAhead: Event = {
      id: "b-proj-5",
      dayId: "d-1",
      eventKey: "bottle_5",
      type: "bottle",
      kind: "instant",
      startTime: 16 * 60,
      label: "Bottle 5",
      amountOz: 5,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    const tpl = buildCreateTemplate({
      type: "bottle",
      dayId: "d-1",
      actuals: [recordedBottle(1, 7 * 60)],
      projected: [projectedAhead],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.eventKey).toBe("bottle_6");
    expect(tpl.label).toBe("Bottle 6");
  });

  it("with empty projected[] passed, still scans actual eventKeys (regex path)", () => {
    // projected[] present but empty → must use max(actuals N) + 1, not the length count.
    const tpl = buildCreateTemplate({
      type: "bottle",
      dayId: "d-1",
      actuals: [recordedBottle(3, 7 * 60)],
      projected: [],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.eventKey).toBe("bottle_4");
  });

  it("with a gap in recorded ordinals, picks max + 1 — NOT first-free", () => {
    // bottle_1 + bottle_4 → bottle_5; filling the gap would collide with engine projections.
    const tpl = buildCreateTemplate({
      type: "bottle",
      dayId: "d-1",
      actuals: [recordedBottle(1, 7 * 60), recordedBottle(4, 14 * 60)],
      projected: [],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.eventKey).toBe("bottle_5");
  });

  // nap removed from CreatableType (PR #146); parents edit projected chips instead.
  it("throws if called with type='nap' (not a CreatableType anymore)", () => {
    expect(() =>
      buildCreateTemplate({
        // @ts-expect-error — nap is no longer a CreatableType.
        type: "nap",
        dayId: "d-1",
        actuals: [],
        settings: settings(),
        nowMinutes: NOW,
      }),
    ).toThrow();
  });

  it("seeds a pump template (block) with default duration and unique eventKey", () => {
    // endTime = startTime + defaultPumpDurationMinutes
    const s = settings();
    const tpl = buildCreateTemplate({
      type: "pump",
      dayId: "d-1",
      actuals: [],
      settings: s,
      nowMinutes: NOW,
    });
    expect(tpl.type).toBe("pump");
    expect(tpl.kind).toBe("block");
    expect(tpl.endTime).toBe(NOW + s.defaultPumpDurationMinutes);
    expect(tpl.eventKey).toMatch(/^pump_/);
    expect(tpl.startTime).toBe(NOW);
  });

  it("seeds an extra template (instant) with empty label; kind upgrades to block on save iff endTime is set", () => {
    // final kind decided in formToEvent based on whether user fills in endTime
    const tpl = buildCreateTemplate({
      type: "extra",
      dayId: "d-1",
      actuals: [],
      settings: settings(),
      nowMinutes: NOW,
    });
    expect(tpl.type).toBe("extra");
    expect(tpl.kind).toBe("instant");
    expect(tpl.label).toBe("");
  });

  it("never sets owner on a freshly seeded template (drawer picks)", () => {
    for (const t of ["bottle", "pump", "extra"] as const) {
      const tpl = buildCreateTemplate({
        type: t,
        dayId: "d-1",
        actuals: [],
        settings: settings(),
        nowMinutes: NOW,
      });
      expect(tpl.owner).toEqual({ slot: "none" });
    }
  });
});
