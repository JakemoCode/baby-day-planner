import { describe, expect, it } from "vitest";
import { currentWakeWindow, nextBottle, nextEvent, nextNap, projectedBedtime } from "./selectors";
import type { Event, EventKind, EventType, Lifecycle, TimeMin } from "./schemas";

const projected: Lifecycle = { state: "projected" };

function makeEvent(
  partial: Partial<Event> & { id: string; type: EventType; startTime: TimeMin },
): Event {
  const kind: EventKind = partial.kind ?? (partial.endTime !== undefined ? "block" : "instant");
  const e: Event = {
    id: partial.id,
    dayId: partial.dayId ?? "day-1",
    eventKey: partial.eventKey ?? `${partial.type}_${partial.id}`,
    type: partial.type,
    kind,
    startTime: partial.startTime,
    label: partial.label ?? partial.type,
    hasPutdown: partial.hasPutdown ?? false,
    lifecycle: partial.lifecycle ?? projected,
  };
  if (partial.endTime !== undefined) e.endTime = partial.endTime;
  if (partial.owner !== undefined) e.owner = partial.owner;
  if (partial.amountOz !== undefined) e.amountOz = partial.amountOz;
  return e;
}

describe("nextEvent", () => {
  it("returns undefined for an empty array", () => {
    expect(nextEvent([], 9 * 60)).toBeUndefined();
  });

  it("returns the first event at or after nowMinutes", () => {
    const a = makeEvent({ id: "a", type: "bottle", startTime: 8 * 60 });
    const b = makeEvent({ id: "b", type: "bottle", startTime: 10 * 60 });
    const c = makeEvent({ id: "c", type: "bottle", startTime: 12 * 60 });
    expect(nextEvent([a, b, c], 9 * 60)).toBe(b);
  });

  it("returns events whose startTime exactly equals nowMinutes", () => {
    const a = makeEvent({ id: "a", type: "bottle", startTime: 8 * 60 });
    const b = makeEvent({ id: "b", type: "bottle", startTime: 10 * 60 });
    expect(nextEvent([a, b], 10 * 60)).toBe(b);
  });

  it("returns undefined when all events are in the past", () => {
    const a = makeEvent({ id: "a", type: "bottle", startTime: 7 * 60 });
    const b = makeEvent({ id: "b", type: "bottle", startTime: 8 * 60 });
    expect(nextEvent([a, b], 9 * 60)).toBeUndefined();
  });

  it("sorts by startTime so unsorted input still yields the earliest upcoming event", () => {
    const later = makeEvent({ id: "later", type: "bottle", startTime: 12 * 60 });
    const earlier = makeEvent({ id: "earlier", type: "bottle", startTime: 10 * 60 });
    expect(nextEvent([later, earlier], 9 * 60)).toBe(earlier);
  });

  it("breaks ties at the same startTime by returning the first in sorted order (stable)", () => {
    const a = makeEvent({ id: "a", type: "bottle", startTime: 10 * 60 });
    const b = makeEvent({ id: "b", type: "nap", startTime: 10 * 60 });
    // input order [a, b]; both share startTime 10*60; nowMinutes equals startTime
    expect(nextEvent([a, b], 10 * 60)).toBe(a);
  });
});

describe("nextBottle", () => {
  it("filters to type === 'bottle' before applying nextEvent semantics", () => {
    const nap = makeEvent({ id: "n", type: "nap", startTime: 9 * 60, endTime: 10 * 60 });
    const b1 = makeEvent({ id: "b1", type: "bottle", startTime: 8 * 60 });
    const b2 = makeEvent({ id: "b2", type: "bottle", startTime: 11 * 60 });
    expect(nextBottle([nap, b1, b2], 9 * 60)).toBe(b2);
  });

  it("returns undefined when no bottle events match", () => {
    const nap = makeEvent({ id: "n", type: "nap", startTime: 9 * 60, endTime: 10 * 60 });
    expect(nextBottle([nap], 8 * 60)).toBeUndefined();
  });
});

describe("nextNap", () => {
  it("filters to type === 'nap' before applying nextEvent semantics", () => {
    const bottle = makeEvent({ id: "b", type: "bottle", startTime: 9 * 60 });
    const n1 = makeEvent({ id: "n1", type: "nap", startTime: 8 * 60, endTime: 9 * 60 });
    const n2 = makeEvent({ id: "n2", type: "nap", startTime: 11 * 60, endTime: 12 * 60 });
    expect(nextNap([bottle, n1, n2], 10 * 60)).toBe(n2);
  });

  it("returns undefined when no nap events match", () => {
    const bottle = makeEvent({ id: "b", type: "bottle", startTime: 9 * 60 });
    expect(nextNap([bottle], 8 * 60)).toBeUndefined();
  });
});

describe("currentWakeWindow", () => {
  it("returns the wake_window event whose interval covers nowMinutes", () => {
    const ww1 = makeEvent({
      id: "ww1",
      type: "wake_window",
      startTime: 7 * 60,
      endTime: 9 * 60,
    });
    const ww2 = makeEvent({
      id: "ww2",
      type: "wake_window",
      startTime: 10 * 60,
      endTime: 12 * 60,
    });
    expect(currentWakeWindow([ww1, ww2], 11 * 60)).toBe(ww2);
  });

  it("returns undefined when nowMinutes equals endTime (half-open interval)", () => {
    const ww = makeEvent({
      id: "ww",
      type: "wake_window",
      startTime: 7 * 60,
      endTime: 9 * 60,
    });
    expect(currentWakeWindow([ww], 9 * 60)).toBeUndefined();
  });

  it("treats a wake_window with no endTime as infinite duration", () => {
    const ww = makeEvent({ id: "ww", type: "wake_window", startTime: 7 * 60 });
    expect(currentWakeWindow([ww], 23 * 60)).toBe(ww);
  });

  it("ignores non-wake_window events", () => {
    const nap = makeEvent({
      id: "n",
      type: "nap",
      startTime: 8 * 60,
      endTime: 10 * 60,
    });
    expect(currentWakeWindow([nap], 9 * 60)).toBeUndefined();
  });

  it("returns undefined when nowMinutes is before any wake_window", () => {
    const ww = makeEvent({
      id: "ww",
      type: "wake_window",
      startTime: 7 * 60,
      endTime: 9 * 60,
    });
    expect(currentWakeWindow([ww], 6 * 60)).toBeUndefined();
  });
});

describe("projectedBedtime", () => {
  it("returns the first bedtime event sorted by startTime", () => {
    const late = makeEvent({
      id: "late",
      type: "bedtime",
      startTime: 20 * 60,
      endTime: 30 * 60,
    });
    const early = makeEvent({
      id: "early",
      type: "bedtime",
      startTime: 19 * 60,
      endTime: 29 * 60,
    });
    expect(projectedBedtime([late, early])).toBe(early);
  });

  it("returns undefined when no bedtime events are present", () => {
    const nap = makeEvent({
      id: "n",
      type: "nap",
      startTime: 8 * 60,
      endTime: 10 * 60,
    });
    expect(projectedBedtime([nap])).toBeUndefined();
  });

  it("returns undefined for an empty array", () => {
    expect(projectedBedtime([])).toBeUndefined();
  });
});
