import { describe, expect, it } from "vitest";
import type { Event, Settings } from "../schemas";
import { NO_OWNER } from "../schemas";
import { resolvedEnd, isInProgress } from "./effectiveEnd";

const napLen = 60; // minutes

/** Minimal Settings stub — only defaultNapLengthMinutes matters for these tests. */
function aSettings(defaultNapLengthMinutes: number): Settings {
  return { defaultNapLengthMinutes } as unknown as Settings;
}

const settings = aSettings(napLen);

/** Recorded nap in the "user committed both timestamps via drawer" shape. */
function recordedNapWithEnd(startTime: number, endTime: number): Event {
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

/** Recorded nap in the "Start Nap Now, waiting for End Nap" shape (no endTime). */
function recordedNapInProgress(startTime: number): Event {
  return {
    id: "nap_1",
    dayId: "day_test",
    eventKey: "nap_1",
    type: "nap",
    kind: "block",
    label: "Nap 1",
    startTime,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: startTime },
  };
}

describe("resolvedEnd", () => {
  // ── recorded WITH endTime (user-committed extent) — NO auto-extend ────────

  it("recorded WITH endTime: returns endTime regardless of now (no auto-extend)", () => {
    // Jake's 2026-05-20 bug repro: nap committed at 9:00–10:00, now is
    // way past at 15:00. Without the fix, this auto-extended to the cap
    // (4×napLen = 13:00) and visually masked daycare chips R21.2 had
    // shifted to 10:00. With the fix, returns 10:00 cleanly.
    const nap = recordedNapWithEnd(9 * 60, 10 * 60);
    expect(resolvedEnd(nap, settings, 9 * 60 + 30)).toBe(10 * 60);
    expect(resolvedEnd(nap, settings, 10 * 60 + 1)).toBe(10 * 60);
    expect(resolvedEnd(nap, settings, 13 * 60)).toBe(10 * 60);
    expect(resolvedEnd(nap, settings, 15 * 60)).toBe(10 * 60);
  });

  // ── recorded WITHOUT endTime (Start Now, in progress) — auto-extends ──────

  it("recorded WITHOUT endTime: returns startTime+napLen when not yet overrun", () => {
    const nap = recordedNapInProgress(9 * 60);
    // base = 9:00 + 60 = 10:00. now = 9:30 → returns 10:00.
    expect(resolvedEnd(nap, settings, 9 * 60 + 30)).toBe(10 * 60);
  });

  it("recorded WITHOUT endTime: extends by 1 napLen when now is just past base", () => {
    const nap = recordedNapInProgress(9 * 60);
    // base = 10:00. now = 10:01 → 1 extension → 11:00.
    expect(resolvedEnd(nap, settings, 10 * 60 + 1)).toBe(11 * 60);
  });

  it("recorded WITHOUT endTime: extends by 2 napLens when in the second extension window", () => {
    const nap = recordedNapInProgress(9 * 60);
    // base = 10:00. now = 11:01 → 2 extensions → 12:00.
    expect(resolvedEnd(nap, settings, 11 * 60 + 1)).toBe(12 * 60);
  });

  it("recorded WITHOUT endTime: caps at 3 extensions (startTime + 4×napLen)", () => {
    const nap = recordedNapInProgress(9 * 60);
    // cap = 9:00 + 4×60 = 13:00. now = 15:00 → capped at 13:00.
    expect(resolvedEnd(nap, settings, 15 * 60)).toBe(13 * 60);
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
    expect(resolvedEnd(nap, settings, 11 * 60)).toBe(10 * 60);
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
    expect(resolvedEnd(nap, settings, 11 * 60)).toBe(9 * 60 + 30);
  });
});

// ---------------------------------------------------------------------------
// isInProgress
// ---------------------------------------------------------------------------

describe("isInProgress", () => {
  it("returns true for a recorded event with startTime <= now < resolvedEnd", () => {
    const nap = recordedNapWithEnd(9 * 60, 10 * 60);
    // now = 9:30, resolvedEnd = 10:00 — in progress
    expect(isInProgress(nap, settings, 9 * 60 + 30)).toBe(true);
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
    expect(isInProgress(projected, settings, 9 * 60 + 30)).toBe(false);
  });

  it("returns false when now is past resolvedEnd (recorded WITH endTime → no extend)", () => {
    const nap = recordedNapWithEnd(9 * 60, 10 * 60);
    // 2026-05-20: recorded WITH endTime no longer auto-extends. now > 10:00 → done.
    expect(isInProgress(nap, settings, 10 * 60 + 1)).toBe(false);
  });

  it("returns false when startTime > now (not started yet)", () => {
    const nap = recordedNapWithEnd(10 * 60, 11 * 60);
    expect(isInProgress(nap, settings, 9 * 60)).toBe(false);
  });
});
