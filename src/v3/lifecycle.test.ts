import { describe, expect, it } from "vitest";
import {
  LifecycleTransitionError,
  isSchedulingType,
  reduceLifecycle,
  type LifecycleAction,
} from "./lifecycle";
import type { Lifecycle } from "./schemas";

const projected: Lifecycle = { state: "projected" };

describe("reduceLifecycle — valid transitions", () => {
  it("projected → started via START on a block event", () => {
    const next = reduceLifecycle(projected, {
      type: "START",
      at: 13 * 60,
      eventKind: "block",
    });
    expect(next).toEqual({ state: "started", committedAt: 13 * 60 });
  });

  it("started → completed via END preserves the original committedAt", () => {
    const started: Lifecycle = { state: "started", committedAt: 13 * 60 };
    const next = reduceLifecycle(started, { type: "END", at: 14 * 60 });
    expect(next).toEqual({ state: "completed", committedAt: 13 * 60 });
  });

  it("projected → completed via RECORD_INSTANT for instant events", () => {
    const next = reduceLifecycle(projected, {
      type: "RECORD_INSTANT",
      at: 9 * 60,
      eventKind: "instant",
    });
    expect(next).toEqual({ state: "completed", committedAt: 9 * 60 });
  });

  it("projected → overridden via OWNER_EDIT", () => {
    const next = reduceLifecycle(projected, {
      type: "OWNER_EDIT",
      at: 8 * 60,
    });
    expect(next).toEqual({ state: "overridden", annotatedAt: 8 * 60 });
  });

  it("overridden → completed via TIME_EDIT", () => {
    const overridden: Lifecycle = { state: "overridden", annotatedAt: 8 * 60 };
    const next = reduceLifecycle(overridden, { type: "TIME_EDIT", at: 12 * 60 });
    expect(next).toEqual({ state: "completed", committedAt: 12 * 60 });
  });

  it("OWNER_EDIT on a recorded event is a no-op (returns same state)", () => {
    const completed: Lifecycle = { state: "completed", committedAt: 13 * 60 };
    const next = reduceLifecycle(completed, { type: "OWNER_EDIT", at: 14 * 60 });
    expect(next).toBe(completed);
  });
});

describe("reduceLifecycle — invalid transitions", () => {
  it("throws if START is called with kind=instant", () => {
    expect(() =>
      reduceLifecycle(projected, {
        type: "START",
        at: 9 * 60,
        eventKind: "instant",
      } satisfies LifecycleAction),
    ).toThrow(LifecycleTransitionError);
  });

  it("throws if START is called from non-projected state", () => {
    const completed: Lifecycle = { state: "completed", committedAt: 13 * 60 };
    expect(() =>
      reduceLifecycle(completed, {
        type: "START",
        at: 14 * 60,
        eventKind: "block",
      }),
    ).toThrow(/requires projected state/);
  });

  it("throws if END is called from non-started state", () => {
    expect(() => reduceLifecycle(projected, { type: "END", at: 14 * 60 })).toThrow(
      /requires started state/,
    );
  });

  it("throws if RECORD_INSTANT is called with kind=block", () => {
    expect(() =>
      reduceLifecycle(projected, {
        type: "RECORD_INSTANT",
        at: 9 * 60,
        eventKind: "block",
      }),
    ).toThrow(/instant-only/);
  });

  it("throws if TIME_EDIT is called on a started block (must use END)", () => {
    const started: Lifecycle = { state: "started", committedAt: 13 * 60 };
    expect(() => reduceLifecycle(started, { type: "TIME_EDIT", at: 14 * 60 })).toThrow(/use END/);
  });
});

describe("isSchedulingType", () => {
  it("returns true for nap, bedtime, daily_recurring", () => {
    expect(isSchedulingType("nap")).toBe(true);
    expect(isSchedulingType("bedtime")).toBe(true);
    expect(isSchedulingType("daily_recurring")).toBe(true);
  });

  it("returns false for recording types (bottle, pump, extra, wake_window, daycare)", () => {
    expect(isSchedulingType("bottle")).toBe(false);
    expect(isSchedulingType("pump")).toBe(false);
    expect(isSchedulingType("extra")).toBe(false);
    expect(isSchedulingType("wake_window")).toBe(false);
    expect(isSchedulingType("daycare_dropoff")).toBe(false);
    expect(isSchedulingType("daycare_pickup")).toBe(false);
  });
});

describe("reduceLifecycle — DRAWER_SAVE", () => {
  const NOW = 8 * 60 + 30;

  // ── projected source ──────────────────────────────────────────────────────

  it("projected nap + time changed + endTime present → overridden (scheduling type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "nap",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "overridden", annotatedAt: NOW });
  });

  it("projected bedtime + time changed → overridden (scheduling type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "bedtime",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "overridden", annotatedAt: NOW });
  });

  it("projected daily_recurring + time changed → overridden (scheduling type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "daily_recurring",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "overridden", annotatedAt: NOW });
  });

  it("projected bottle (instant) + time changed → completed (recording type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "bottle",
        eventKind: "instant",
        timeChanged: true,
        hasEndTime: false,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "completed", committedAt: NOW });
  });

  it("projected extra (block) + time changed + endTime → completed (recording type)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "extra",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "completed", committedAt: NOW });
  });

  it("projected extra (block) + time changed + no endTime → started (in-progress block)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "extra",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: false,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "started", committedAt: NOW });
  });

  it("projected + no time change (owner/amount only) → overridden", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "bottle",
        eventKind: "instant",
        timeChanged: false,
        hasEndTime: false,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "overridden", annotatedAt: NOW });
  });

  // ── overridden source ─────────────────────────────────────────────────────

  it("overridden nap + time changed → overridden (idempotent re-scheduling)", () => {
    const next = reduceLifecycle(
      { state: "overridden", annotatedAt: 8 * 60 },
      {
        type: "DRAWER_SAVE",
        eventType: "nap",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "overridden", annotatedAt: NOW });
  });

  it("overridden bottle + time changed → completed (locks in the time)", () => {
    const next = reduceLifecycle(
      { state: "overridden", annotatedAt: 7 * 60 },
      {
        type: "DRAWER_SAVE",
        eventType: "bottle",
        eventKind: "instant",
        timeChanged: true,
        hasEndTime: false,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "completed", committedAt: NOW });
  });

  it("overridden + no time change (field edit only) → lifecycle unchanged", () => {
    const overridden: Lifecycle = { state: "overridden", annotatedAt: 7 * 60 };
    const next = reduceLifecycle(overridden, {
      type: "DRAWER_SAVE",
      eventType: "nap",
      eventKind: "block",
      timeChanged: false,
      hasEndTime: true,
      nowMinutes: NOW,
    });
    expect(next).toBe(overridden);
  });

  // ── already-recorded sources stay frozen ─────────────────────────────────

  it("started block stays started regardless of edits", () => {
    const started: Lifecycle = { state: "started", committedAt: 9 * 60 };
    const next = reduceLifecycle(started, {
      type: "DRAWER_SAVE",
      eventType: "nap",
      eventKind: "block",
      timeChanged: true,
      hasEndTime: false,
      nowMinutes: NOW,
    });
    expect(next).toBe(started);
  });

  it("completed event stays completed; committedAt is unchanged", () => {
    const completed: Lifecycle = { state: "completed", committedAt: 10 * 60 };
    const next = reduceLifecycle(completed, {
      type: "DRAWER_SAVE",
      eventType: "bottle",
      eventKind: "instant",
      timeChanged: true,
      hasEndTime: false,
      nowMinutes: NOW,
    });
    expect(next).toBe(completed);
  });
});
