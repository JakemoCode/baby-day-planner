import { describe, expect, it } from "vitest";
import type { Event } from "../schemas";
import { effectiveEndOf } from "./effectiveEnd";

const napLen = 60; // minutes

function recordedNap(startTime: number, endTime: number): Event {
  return {
    id: "nap_1",
    dayId: "day_test",
    eventKey: "nap_1",
    type: "nap",
    kind: "block",
    label: "Nap 1",
    startTime,
    endTime,
    hasPutdown: false,
    lifecycle: { state: "recorded", annotatedAt: startTime },
  };
}

describe("effectiveEndOf", () => {
  it("returns endTime when now <= endTime (not yet overrun)", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    expect(effectiveEndOf(nap, napLen, 9 * 60 + 30)).toBe(10 * 60);
  });

  it("extends by 1 napLen when now is just past endTime", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // now = 10:01 → 1 extension → effectiveEnd = 11:00
    expect(effectiveEndOf(nap, napLen, 10 * 60 + 1)).toBe(11 * 60);
  });

  it("extends by 2 napLens when now is in the second extension window", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // now = 11:01 → 2 extensions → effectiveEnd = 12:00
    expect(effectiveEndOf(nap, napLen, 11 * 60 + 1)).toBe(12 * 60);
  });

  it("caps at 3 extensions (startTime + 4×napLen) even when now is far beyond", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // cap = 9:00 + 4*60 = 13:00. now = 15:00 >> cap
    expect(effectiveEndOf(nap, napLen, 15 * 60)).toBe(13 * 60);
  });

  it("passes through for projected events (state !== 'recorded')", () => {
    const nap: Event = {
      id: "nap_1",
      dayId: "day_test",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 10 * 60,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
    // projected — no extension regardless of now
    expect(effectiveEndOf(nap, napLen, 11 * 60)).toBe(10 * 60);
  });

  it("passes through for completed events (state === 'completed')", () => {
    const nap: Event = {
      id: "nap_1",
      dayId: "day_test",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 9 * 60 + 30,
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 9 * 60 },
    };
    expect(effectiveEndOf(nap, napLen, 11 * 60)).toBe(9 * 60 + 30);
  });

  it("returns endTime when now exactly equals endTime (not overrun)", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    expect(effectiveEndOf(nap, napLen, 10 * 60)).toBe(10 * 60);
  });

  it("recorded nap with no endTime uses startTime + napLen as base (soft-end placeholder)", () => {
    // No endTime: base = 9:00 + 60 = 10:00.
    // now = 9:30 → not past baseEnd → returns 10:00.
    const nap: Event = {
      id: "nap_1",
      dayId: "day_test",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      hasPutdown: false,
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    };
    expect(effectiveEndOf(nap, napLen, 9 * 60 + 30)).toBe(10 * 60);
  });
});
