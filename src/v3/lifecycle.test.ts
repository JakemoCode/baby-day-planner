import { describe, expect, it } from "vitest";
import { isSchedulingType, migrateLegacyLifecycle, reduceLifecycle } from "./lifecycle";
import type { Lifecycle } from "./schemas";

const projected: Lifecycle = { state: "projected" };

describe("reduceLifecycle — valid transitions", () => {
  it("projected → completed via RECORD_INSTANT for instant events", () => {
    const next = reduceLifecycle(projected, {
      type: "RECORD_INSTANT",
      at: 9 * 60,
      eventKind: "instant",
    });
    expect(next).toEqual({ state: "completed", committedAt: 9 * 60 });
  });

  it("projected → recorded via OWNER_EDIT (annotates with no time change)", () => {
    const next = reduceLifecycle(projected, {
      type: "OWNER_EDIT",
      at: 8 * 60,
    });
    expect(next).toEqual({ state: "recorded", annotatedAt: 8 * 60 });
  });

  it("recorded → completed via TIME_EDIT", () => {
    const recorded: Lifecycle = { state: "recorded", annotatedAt: 8 * 60 };
    const next = reduceLifecycle(recorded, { type: "TIME_EDIT", at: 12 * 60 });
    expect(next).toEqual({ state: "completed", committedAt: 12 * 60 });
  });

  it("projected → completed via TIME_EDIT", () => {
    const next = reduceLifecycle(projected, { type: "TIME_EDIT", at: 12 * 60 });
    expect(next).toEqual({ state: "completed", committedAt: 12 * 60 });
  });

  it("OWNER_EDIT on a completed event is a no-op (returns same state)", () => {
    const completed: Lifecycle = { state: "completed", committedAt: 13 * 60 };
    const next = reduceLifecycle(completed, { type: "OWNER_EDIT", at: 14 * 60 });
    expect(next).toBe(completed);
  });

  it("OWNER_EDIT on a recorded event is a no-op (stays recorded)", () => {
    const recorded: Lifecycle = { state: "recorded", annotatedAt: 8 * 60 };
    const next = reduceLifecycle(recorded, { type: "OWNER_EDIT", at: 14 * 60 });
    expect(next).toBe(recorded);
  });
});

describe("reduceLifecycle — invalid transitions", () => {
  it("throws if RECORD_INSTANT is called with kind=block", () => {
    expect(() =>
      reduceLifecycle(projected, {
        type: "RECORD_INSTANT",
        at: 9 * 60,
        eventKind: "block",
      }),
    ).toThrow(/instant-only/);
  });
});

describe("isSchedulingType", () => {
  it.each(["nap", "bedtime", "daily_recurring"] as const)("isSchedulingType(%s) → true", (type) =>
    expect(isSchedulingType(type)).toBe(true),
  );
  it.each(["bottle", "pump", "extra", "wake_window", "daycare_dropoff", "daycare_pickup"] as const)(
    "isSchedulingType(%s) → false",
    (type) => expect(isSchedulingType(type)).toBe(false),
  );
});

describe("reduceLifecycle — DRAWER_SAVE", () => {
  const NOW = 8 * 60 + 30;

  // ── projected source ──────────────────────────────────────────────────────

  it("projected nap + time changed + endTime present → recorded (scheduling type)", () => {
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
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("projected bedtime + time changed → recorded (scheduling type)", () => {
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
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("projected daily_recurring + time changed → recorded (scheduling type)", () => {
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
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
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

  it("projected extra (block) + time changed + no endTime → recorded (in-progress block)", () => {
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
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("projected + no time change (owner/amount only) → recorded", () => {
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
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  // ── recorded source ─────────────────────────────────────────────────────

  it("recorded nap + time changed → recorded (idempotent re-scheduling)", () => {
    const next = reduceLifecycle(
      { state: "recorded", annotatedAt: 8 * 60 },
      {
        type: "DRAWER_SAVE",
        eventType: "nap",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("recorded bottle + time changed → completed (locks in the time)", () => {
    const next = reduceLifecycle(
      { state: "recorded", annotatedAt: 7 * 60 },
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

  it("recorded + no time change (field edit only) → lifecycle unchanged", () => {
    const recorded: Lifecycle = { state: "recorded", annotatedAt: 7 * 60 };
    const next = reduceLifecycle(recorded, {
      type: "DRAWER_SAVE",
      eventType: "nap",
      eventKind: "block",
      timeChanged: false,
      hasEndTime: true,
      nowMinutes: NOW,
    });
    expect(next).toBe(recorded);
  });

  // ── already-completed stays frozen ─────────────────────────────────────

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

// ---------------------------------------------------------------------------
// migrateLegacyLifecycle
// ---------------------------------------------------------------------------

describe("migrateLegacyLifecycle", () => {
  it("migrates state: 'started' → 'recorded' (committedAt → annotatedAt)", () => {
    const result = migrateLegacyLifecycle({ state: "started", committedAt: 9 * 60 + 2 }, 9 * 60);
    expect(result).toEqual({ state: "recorded", annotatedAt: 9 * 60 + 2 });
  });

  it("migrates state: 'overridden' → 'recorded' (annotatedAt preserved)", () => {
    const result = migrateLegacyLifecycle(
      { state: "overridden", annotatedAt: 13 * 60 + 5 },
      13 * 60,
    );
    expect(result).toEqual({ state: "recorded", annotatedAt: 13 * 60 + 5 });
  });

  it("uses fallbackTime as annotatedAt when legacy committedAt/annotatedAt is missing", () => {
    const result = migrateLegacyLifecycle({ state: "started" }, 9 * 60);
    expect(result).toEqual({ state: "recorded", annotatedAt: 9 * 60 });
  });

  it("returns null for modern lifecycle states (no migration needed)", () => {
    expect(migrateLegacyLifecycle({ state: "completed", committedAt: 9 * 60 }, 9 * 60)).toBeNull();
    expect(migrateLegacyLifecycle({ state: "recorded", annotatedAt: 9 * 60 }, 9 * 60)).toBeNull();
    expect(migrateLegacyLifecycle({ state: "projected" }, 9 * 60)).toBeNull();
  });

  it("returns null for null/non-object input", () => {
    expect(migrateLegacyLifecycle(null, 0)).toBeNull();
    expect(migrateLegacyLifecycle(undefined, 0)).toBeNull();
    expect(migrateLegacyLifecycle("started", 0)).toBeNull();
  });
});
