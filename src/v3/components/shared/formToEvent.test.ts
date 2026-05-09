/**
 * Form → V3 Event transform: the lifecycle dispatch heart of the drawer.
 *
 * V2 mapped status="projected" → completed/overridden via a `recorded`
 * boolean + a status string. V3 collapses that into the discriminated
 * `lifecycle` union, with one extra state (`started`) for blocks the
 * user has started but not ended yet.
 *
 * The rules:
 *   projected + time-changed + endTime present → completed
 *   projected + time-changed + no endTime (block) → started
 *   projected + time-changed + no endTime (instant) → completed
 *   projected + only owner/amount/label changed → overridden
 *   already started/completed/overridden → state stays, fields patch
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../../schemas";
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
  it("projected block + time changed + endTime present → completed", () => {
    const source = projectedNap();
    const form: FormState = { ...formFromEvent(source), startTime: 9 * 60 + 5 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
    expect(next.startTime).toBe(9 * 60 + 5);
  });

  it("projected block + time changed + endTime missing → started", () => {
    const { endTime: _omit, ...rest } = projectedNap();
    const source = rest as Event;
    const form: FormState = { ...formFromEvent(source), startTime: 9 * 60 + 5 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "started", committedAt: NOW });
    expect(next.endTime).toBeUndefined();
  });

  it("projected instant + time changed → completed", () => {
    const source = projectedBottle();
    const form: FormState = { ...formFromEvent(source), startTime: 7 * 60 + 35 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
  });

  it("projected + only owner changed → overridden (annotated)", () => {
    const source = projectedNap();
    const form: FormState = { ...formFromEvent(source), owner: { slot: "parent1" } };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "overridden", annotatedAt: NOW });
    expect(next.owner).toEqual({ slot: "parent1" });
    expect(next.startTime).toBe(source.startTime);
  });

  it("projected + only amount changed → overridden", () => {
    const source = projectedBottle();
    const form: FormState = { ...formFromEvent(source), amountOz: 6 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "overridden", annotatedAt: NOW });
    expect(next.amountOz).toBe(6);
  });

  it("projected + nothing changed → overridden (defensive — drawer normally disables save)", () => {
    const source = projectedNap();
    const form: FormState = formFromEvent(source);
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "overridden", annotatedAt: NOW });
  });
});

describe("formToEvent — already-recorded sources stay in their state", () => {
  it("started block stays started; field updates apply", () => {
    const { endTime: _omit, ...rest } = projectedNap({
      lifecycle: { state: "started", committedAt: 9 * 60 },
    });
    const source = rest as Event;
    const form: FormState = { ...formFromEvent(source), owner: { slot: "parent2" } };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "started", committedAt: 9 * 60 });
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

  it("overridden event becomes recorded if user changes time", () => {
    const source = projectedNap({
      lifecycle: { state: "overridden", annotatedAt: 8 * 60 },
    });
    const form: FormState = { ...formFromEvent(source), startTime: 9 * 60 + 5 };
    const next = formToEvent(form, source, NOW);
    expect(next.lifecycle).toEqual({ state: "completed", committedAt: NOW });
  });
});

describe("formToEvent — exactOptionalPropertyTypes safety", () => {
  it("clears endTime when the form removes it (does not set undefined)", () => {
    const source = projectedNap();
    const form: FormState = { ...formFromEvent(source), endTime: undefined };
    const next = formToEvent(form, source, NOW);
    expect("endTime" in next).toBe(false);
  });

  it("clears owner when the form unsets it", () => {
    const source = projectedNap({ owner: { slot: "parent1" } });
    const form: FormState = { ...formFromEvent(source), owner: undefined };
    const next = formToEvent(form, source, NOW);
    expect("owner" in next).toBe(false);
  });
});
