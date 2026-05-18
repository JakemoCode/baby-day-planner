import { describe, expect, it } from "vitest";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";
import { effectiveEndOf, isInProgress } from "./effectiveEnd";

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
    owner: NO_OWNER,
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
      owner: NO_OWNER,
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
      owner: NO_OWNER,
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
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    };
    expect(effectiveEndOf(nap, napLen, 9 * 60 + 30)).toBe(10 * 60);
  });

  // Boundary tests for the cap (regression guard against off-by-one in the
  // Math.min(3, ...) clamp).
  it("at exactly 3 extensions away (now = baseEnd + 3*napLen): caps at 4*napLen total", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // baseEnd = 10:00, +3*napLen = 13:00. now = 13:00 → cap.
    expect(effectiveEndOf(nap, napLen, 13 * 60)).toBe(13 * 60);
  });

  it("just past the cap (now = baseEnd + 4*napLen): still capped at 4*napLen total", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // baseEnd = 10:00, +4*napLen = 14:00. now = 14:00 → still capped at 13:00.
    expect(effectiveEndOf(nap, napLen, 14 * 60)).toBe(13 * 60);
  });

  it("recorded nap with no endTime, overrun + cap: base = startTime+napLen, capped at startTime+4*napLen", () => {
    // No endTime: base = 9:00 + 60 = 10:00. Cap = base + 3*napLen = 13:00.
    // now = 18:00 (way past cap) → capped at 13:00.
    const nap: Event = {
      id: "nap_1",
      dayId: "day_test",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
    };
    expect(effectiveEndOf(nap, napLen, 18 * 60)).toBe(13 * 60);
  });
});

// ---------------------------------------------------------------------------
// isInProgress
// ---------------------------------------------------------------------------

describe("isInProgress", () => {
  it("returns true for a recorded event with startTime <= now < effectiveEnd", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // now = 9:30, effectiveEnd = 10:00 — in progress
    expect(isInProgress(nap, napLen, 9 * 60 + 30)).toBe(true);
  });

  it("returns false when lifecycle.state !== 'recorded'", () => {
    const projected: Event = {
      id: "nap_1",
      dayId: "day_test",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 10 * 60,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    expect(isInProgress(projected, napLen, 9 * 60 + 30)).toBe(false);
  });

  it("returns false when now is past the effectiveEnd (nap is over)", () => {
    const nap = recordedNap(9 * 60, 10 * 60);
    // now = 10:01 → effectiveEnd auto-extends to 11:00, still > now? No:
    // now (10:01) >= effectiveEnd (11:00) is false — still in-progress.
    // Use far-past-cap now instead:
    expect(isInProgress(nap, napLen, 14 * 60)).toBe(false);
  });

  it("returns false when startTime > now (not started yet)", () => {
    const nap = recordedNap(10 * 60, 11 * 60);
    expect(isInProgress(nap, napLen, 9 * 60)).toBe(false);
  });
});
