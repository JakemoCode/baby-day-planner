/**
 * Form → V3 Event transform: the lifecycle dispatch heart of the drawer.
 *
 * See `formToEvent.ts` for the authoritative lifecycle dispatch rules.
 */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aSettings } from "../../__tests__/factories";
import { projectDay } from "../../engine/projectDay";
import { NO_OWNER, type Event } from "../../schemas";
import { formToEvent, type FormState } from "./formToEvent";
import { canDeleteEvent } from "./drawerDeletePolicy";

const NOW = 8 * 60 + 30;

const projectedNap = (overrides: Partial<Event> = {}): Event => ({
  id: "nap-1",
  dayId: "d-1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

const projectedBottle = (overrides: Partial<Event> = {}): Event => ({
  id: "bot-1",
  dayId: "d-1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 7 * 60 + 30,
  label: "Bottle 1",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

const formFromEvent = (e: Event): FormState => ({
  startTime: e.startTime,
  endTime: e.endTime,
  amountOz: e.amountOz,
  owner: e.owner,
  label: e.label,
});

describe("formToEvent — lifecycle dispatch from projected", () => {
  // Predict-don't-prescribe: nap/bedtime time edits are scheduling intent, not reality.
  // Keeps lifecycle in recorded so hasPutdown (gated to projected|recorded) is preserved.
  it("projected NAP + time changed + endTime present → recorded (predict-don't-prescribe)", () => {
    const source = projectedNap();
    const form: FormState = { ...formFromEvent(source), startTime: 9 * 60 + 5 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
    expect(next.startTime).toBe(9 * 60 + 5);
  });

  it("projected BEDTIME + time changed + endTime present → recorded", () => {
    const source = projectedNap({
      eventKey: "bedtime",
      type: "bedtime",
      label: "Bedtime",
      startTime: 19 * 60,
      endTime: 30 * 60,
    });
    const form: FormState = { ...formFromEvent(source), startTime: 19 * 60 + 15 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("projected DAILY_RECURRING block + time changed → recorded (no action buttons, drawer is scheduling)", () => {
    // One-day reschedule; tomorrow re-projects from Settings time.
    const source = projectedNap({
      eventKey: "cook_dinner",
      type: "daily_recurring",
      label: "Cook dinner",
      startTime: 17 * 60,
      endTime: 17 * 60 + 45,
    });
    const form: FormState = { ...formFromEvent(source), startTime: 18 * 60 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("extra template (kind=instant) + endTime filled in on save → upgrades to block + completed", () => {
    // endTime present → kind promoted to block and lifecycle to completed.
    const source: Event = {
      id: "x-1",
      dayId: "d-1",
      eventKey: "x-1",
      type: "extra",
      kind: "instant",
      label: "Walk",
      startTime: 9 * 60,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    const form: FormState = {
      startTime: 9 * 60 + 5,
      endTime: 9 * 60 + 35,
      amountOz: undefined,
      owner: undefined,
      label: "Walk",
    };
    const next = formToEvent(form, source, NOW);
    expect(next.kind).toBe("block");
    expect(next.endTime).toBe(9 * 60 + 35);
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
  });

  it("extra template (kind=instant) + no endTime on save → stays instant + completed", () => {
    const source: Event = {
      id: "x-2",
      dayId: "d-1",
      eventKey: "x-2",
      type: "extra",
      kind: "instant",
      label: "Snack",
      startTime: 10 * 60,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    const form: FormState = {
      startTime: 10 * 60 + 15,
      endTime: undefined,
      amountOz: undefined,
      owner: undefined,
      label: "Snack",
    };
    const next = formToEvent(form, source, NOW);
    expect(next.kind).toBe("instant");
    expect(next.endTime).toBeUndefined();
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
  });

  it("projected non-nap/bedtime block (e.g. extra) + time changed + endTime → completed (unchanged)", () => {
    // Predict-don't-prescribe only applies to nap/bedtime; extras lock in time on edit.
    const source = projectedNap({
      eventKey: "extra_1",
      type: "extra",
      label: "Custom",
    });
    const form: FormState = { ...formFromEvent(source), startTime: 9 * 60 + 5 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
  });

  it("projected block + time changed + endTime missing → recorded (in-progress block)", () => {
    const { endTime: _omit, ...rest } = projectedNap();
    const source = rest as Event;
    const form: FormState = { ...formFromEvent(source), startTime: 9 * 60 + 5 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
    expect(next.endTime).toBeUndefined();
  });

  it("projected instant + time changed → completed", () => {
    const source = projectedBottle();
    const form: FormState = { ...formFromEvent(source), startTime: 7 * 60 + 35 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
  });

  it("projected + only owner changed → recorded (annotated)", () => {
    const source = projectedNap();
    const form: FormState = { ...formFromEvent(source), owner: { slot: "parent1" } };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
    expect(next.owner).toEqual({ slot: "parent1" });
    expect(next.startTime).toBe(source.startTime);
  });

  it("projected + only amount changed → recorded", () => {
    const source = projectedBottle();
    const form: FormState = { ...formFromEvent(source), amountOz: 6 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
    expect(next.amountOz).toBe(6);
  });

  it("projected + nothing changed → recorded (defensive — drawer normally disables save)", () => {
    const source = projectedNap();
    const form: FormState = formFromEvent(source);
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
  });
});

describe("formToEvent — already-recorded sources stay in their state", () => {
  it("recorded block stays recorded; field updates (owner-only, no time change) apply without bumping annotatedAt", () => {
    const { endTime: _omit, ...rest } = projectedNap({
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    });
    const source = rest as Event;
    const form: FormState = { ...formFromEvent(source), owner: { slot: "parent2" } };
    const next = formToEvent(form, source, NOW);
    // No time change → lifecycle returned unchanged (same annotatedAt)
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: 9 * 60 });
    expect(next.owner).toEqual({ slot: "parent2" });
  });

  it("completed event stays completed; committedAt unchanged", () => {
    const source = projectedNap({
      lifecycle: { state: "completed", committedAt: 10 * 60 },
    });
    const form: FormState = { ...formFromEvent(source), owner: { slot: "parent1" } };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: 10 * 60 });
  });

  it("recorded NAP + time edit stays recorded (predict-don't-prescribe — re-scheduling is still scheduling)", () => {
    // Nap re-scheduling is still scheduling intent; stays recorded with updated annotatedAt.
    const source = projectedNap({
      lifecycle: { state: "recorded", annotatedAt: 8 * 60 },
    });
    const form: FormState = { ...formFromEvent(source), startTime: 9 * 60 + 5 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("recorded non-nap/bedtime + time edit promotes to completed (unchanged)", () => {
    const source = projectedBottle({
      lifecycle: { state: "recorded", annotatedAt: 7 * 60 },
    });
    const form: FormState = { ...formFromEvent(source), startTime: 7 * 60 + 45 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
  });
});

describe("formToEvent — putdown survives a drawer time-edit (integration)", () => {
  // Regression: without predict-don't-prescribe, edited nap would flip to completed,
  // deriveHasPutdown would return false, and the renderer would drop the putdown chip.
  it("nap time edit → engine still emits the nap with hasPutdown=true", () => {
    // ADR-0006: pin nowMinutes before nap_1 (9:00) so engine auto-promote doesn't flip it to recorded.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120],
        defaultNapLengthMinutes: 60,
      }),
      actuals: [],
      nowMinutes: 8 * 60,
    });
    const initial = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });
    const projectedNapEvent = initial.find((e) => e.eventKey === "nap_1");
    expect(projectedNapEvent).toBeDefined();
    expect(projectedNapEvent!.lifecycle.state).toBe("projected");
    expect(projectedNapEvent!.hasPutdown).toBe(true);

    // Drawer: shift nap start +5 min and save.
    const form: FormState = {
      startTime: projectedNapEvent!.startTime + 5,
      endTime: projectedNapEvent!.endTime,
      amountOz: projectedNapEvent!.amountOz,
      owner: projectedNapEvent!.owner,
      label: projectedNapEvent!.label,
    };
    const persisted = formToEvent(form, projectedNapEvent!, NOW);
    expect(persisted.lifecycle.state).toBe("recorded");

    // Override flows into actuals; engine re-projects with it seeded.
    const reprojected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: [persisted],
      nowMinutes: ctx.nowMinutes,
    });
    const nap = reprojected.find((e) => e.eventKey === "nap_1");
    expect(nap).toBeDefined();
    expect(nap!.hasPutdown).toBe(true); // ← the fix.
  });
});

describe("formToEvent — exactOptionalPropertyTypes safety", () => {
  it("clears endTime when the form removes it (does not set undefined)", () => {
    const source = projectedNap();
    const form: FormState = { ...formFromEvent(source), endTime: undefined };
    const next = formToEvent(form, source, NOW);
    expect("endTime" in next).toBe(false);
  });

  it("clears owner to NO_OWNER when the form unsets it (§F37)", () => {
    const source = projectedNap({ owner: { slot: "parent1" } });
    const form: FormState = { ...formFromEvent(source), owner: undefined };
    const next = formToEvent(form, source, NOW);
    expect(next.owner).toEqual({ slot: "none" });
  });
});

describe("formToEvent — create mode (FAB-added events)", () => {
  // FAB creates a real event (not annotation). At/past now → completed; future → recorded.
  // Pre-fix: create at now produced recorded+annotatedAt===startTime, hiding the Delete button.
  it("bottle created at now → completed (committed reality)", () => {
    const source = projectedBottle({ startTime: NOW });
    const next = formToEvent(formFromEvent(source), source, NOW, "create");
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
  });

  it("bottle created in the past → completed", () => {
    const source = projectedBottle({ startTime: NOW - 30 });
    const next = formToEvent(formFromEvent(source), source, NOW, "create");
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
  });

  it("bottle created in the future → recorded (scheduled, not yet real)", () => {
    const source = projectedBottle({ startTime: NOW + 120 });
    const next = formToEvent(formFromEvent(source), source, NOW, "create");
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("edit mode at now stays recorded (only create asserts reality)", () => {
    // Guards the create branch from leaking into the edit path.
    const source = projectedBottle({ startTime: NOW });
    const next = formToEvent(formFromEvent(source), source, NOW, "edit");
    expect(next.lifecycle).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  // Seam: bottle created at now must be deletable. Pre-fix: recorded+annotatedAt===startTime → canDeleteEvent false.
  it("a bottle created at now is deletable (the bug this fix closes)", () => {
    const source = projectedBottle({ startTime: NOW });
    const created = formToEvent(formFromEvent(source), source, NOW, "create");
    expect(canDeleteEvent(created, { mode: "edit", hasOnDelete: true })).toBe(true);
  });
});
