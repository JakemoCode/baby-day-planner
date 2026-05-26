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
  // Predict-don't-prescribe: editing a projected NAP or BEDTIME's time in the
  // drawer is SCHEDULING INTENT, not a recording of reality. Only the action
  // buttons (Start Nap, End Nap) promote a nap to recorded/completed. This
  // preserves `hasPutdown` (which is gated to projected | recorded) across
  // a drawer time-edit — fixing the "changing nap time removes putdown" bug.
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
    // Recurring entries (Cook Dinner, etc.) project from settings every
    // day. Editing today's time is a one-day reschedule; tomorrow still
    // projects at the configured Settings time. See `isSchedulingType`
    // caveat: not every daily_recurring is forecast — but the default is.
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
    // Template defaults to instant. If the user enters an endTime in
    // the drawer, save derives kind="block". With endTime committed,
    // the lifecycle is "completed".
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
    // Regression guard: the predict-don't-prescribe rule is targeted at nap
    // and bedtime, NOT all block types. An "extra" event keeps the V2-style
    // "time-edit = lock in time" semantic, because custom user events don't
    // have action-button start/end ceremony.
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
    // Same logic as the projected→recorded case above: drawer time-edits
    // on naps are scheduling intent, never reality. The second time the
    // user reschedules also doesn't lock anything in.
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
  // This is the regression test for the "changing nap time removes putdown"
  // bug. It exercises the full chain: formToEvent → engine projection →
  // hasPutdown gate. Without the predict-don't-prescribe carve-out, the
  // edited nap's lifecycle would flip to `completed`, deriveHasPutdown
  // (which only accepts `projected` | `recorded`) would return false,
  // and the renderer would drop the putdown.
  it("nap time edit → engine still emits the nap with hasPutdown=true", () => {
    // Seed: user records yesterday's bedtime end (= today's wake at 7:00).
    // The cascade emits a projected nap_1 around 9:00 with hasPutdown=true.
    // ADR-0006: pin nowMinutes BEFORE the projected nap_1 (9:00) so the
    // engine's Now-cross auto-promote doesn't flip it to recorded — the
    // test specifically validates the projected-nap drawer-edit path.
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

    // User opens the drawer, shifts the nap start +5 minutes, saves.
    const form: FormState = {
      startTime: projectedNapEvent!.startTime + 5,
      endTime: projectedNapEvent!.endTime,
      amountOz: projectedNapEvent!.amountOz,
      owner: projectedNapEvent!.owner,
      label: projectedNapEvent!.label,
    };
    const persisted = formToEvent(form, projectedNapEvent!, NOW);
    expect(persisted.lifecycle.state).toBe("recorded");

    // The persisted override flows back into ctx.actuals on next read; the
    // engine projects again with this override seeded.
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
