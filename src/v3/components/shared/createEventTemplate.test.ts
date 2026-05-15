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

  // The FAB add-nap path is purely additive — never claims a cascade
  // slot, never numbers in the label. The chronological cascade
  // (src/v3/engine/rules/naps.ts) walks real naps by startTime
  // regardless of eventKey shape, so the UUID nap inserts into the
  // rhythm at the user's chosen time without displacing projections.
  // Display labels (`Nap 1`, `Nap 2`, …) come from the cascade's
  // chronological numbering pass; the create-time label is just "Nap".
  // Retro-record an actual rhythm nap by editing the projected nap
  // chip via the drawer.

  it("seeds a nap template as block-kind without endTime, UUID eventKey, label 'Nap'", () => {
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
    expect(tpl.eventKey).not.toMatch(/^nap_\d+$/);
    expect(tpl.eventKey).toMatch(/^nap_/); // UUID still has "nap_" prefix
    expect(tpl.label).toBe("Nap");
    expect(tpl.lifecycle).toEqual({ state: "projected" });
  });

  it("ignores recorded nap count — eventKey + label do not change with prior naps", () => {
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
    expect(tpl.eventKey).not.toMatch(/^nap_\d+$/);
    expect(tpl.label).toBe("Nap");
  });

  it("ignores projected naps — eventKey + label do not change with prior projections", () => {
    const projected: Event[] = [1, 2, 3, 4].map((n) => ({
      id: `proj_nap_${n}`,
      dayId: "d-1",
      eventKey: `nap_${n}`,
      type: "nap",
      kind: "block",
      startTime: 9 * 60 + n * 60,
      label: `Nap ${n}`,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    }));
    const tpl = buildCreateTemplate({
      type: "nap",
      dayId: "d-1",
      actuals: [],
      settings: settings({ wakeWindowsMinutes: [120, 135, 135, 150] }),
      nowMinutes: 22 * 60,
      projected,
    });
    expect(tpl.eventKey).not.toMatch(/^nap_\d+$/);
    expect(tpl.label).toBe("Nap");
  });

  it("seeds a pump template (block) with default duration and unique eventKey", () => {
    // Pumps are duration events (20–30 min); template starts as block
    // with endTime = startTime + defaultPumpDurationMinutes.
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
    // Template defaults to instant — final kind is decided in
    // formToEvent based on whether the user fills in endTime.
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
