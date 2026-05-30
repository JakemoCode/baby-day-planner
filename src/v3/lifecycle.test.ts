import { describe, expect, it } from "vitest";
import {
  isFutureProjected,
  isNextProjectedOfType,
  isActiveNap,
  isFocusNap,
  isNearestBottle,
  NAP_END_GRACE_MIN,
  isSchedulingType,
  migrateLegacyLifecycle,
  reduceLifecycle,
} from "./lifecycle";
import { NO_OWNER, type Event, type Lifecycle } from "./schemas";

const projected: Lifecycle = { state: "projected" };

function projectedNap(startTime: number): Event {
  return {
    id: "nap_1",
    dayId: "d1",
    eventKey: "nap_1",
    type: "nap",
    kind: "block",
    label: "Nap 1",
    startTime,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "projected" },
  };
}

describe("isFutureProjected", () => {
  it("returns true when projected AND startTime is strictly after Now", () => {
    expect(isFutureProjected(projectedNap(14 * 60), 12 * 60)).toBe(true);
  });

  it("returns false at startTime === Now (boundary excluded — the moment of crossing)", () => {
    expect(isFutureProjected(projectedNap(12 * 60), 12 * 60)).toBe(false);
  });

  it("returns false when startTime is in the past", () => {
    expect(isFutureProjected(projectedNap(10 * 60), 12 * 60)).toBe(false);
  });

  it("returns false for a recorded event even if startTime is in the future", () => {
    const nap = projectedNap(14 * 60);
    const recorded: Event = {
      ...nap,
      lifecycle: { state: "recorded", annotatedAt: 14 * 60 },
    };
    expect(isFutureProjected(recorded, 12 * 60)).toBe(false);
  });

  it("returns false for a completed event", () => {
    const nap = projectedNap(14 * 60);
    const completed: Event = {
      ...nap,
      lifecycle: { state: "completed", committedAt: 14 * 60 },
    };
    expect(isFutureProjected(completed, 12 * 60)).toBe(false);
  });

  it("returns true for a future projected bottle (rhythm-cascade type)", () => {
    const bottle: Event = {
      id: "b",
      dayId: "d1",
      eventKey: "bottle_2",
      type: "bottle",
      kind: "instant",
      label: "Bottle 2",
      startTime: 14 * 60,
      amountOz: 6,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    expect(isFutureProjected(bottle, 12 * 60)).toBe(true);
  });

  it("returns false for the dream-feed slot (eventKey === 'bottle_dream') — explicit-schedule, not rhythm-cascade", () => {
    const dream: Event = {
      id: "dream",
      dayId: "d1",
      eventKey: "bottle_dream",
      type: "bottle",
      kind: "instant",
      label: "Dream Feed",
      startTime: 23 * 60,
      amountOz: 6,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    expect(isFutureProjected(dream, 12 * 60)).toBe(false);
  });

  it("returns false for daycare / daily_recurring / extra / bedtime — fixed-time or explicit-schedule types", () => {
    const types: ReadonlyArray<Event["type"]> = [
      "daycare_dropoff",
      "daycare_pickup",
      "daily_recurring",
      "extra",
      "bedtime",
      "pump",
    ];
    for (const type of types) {
      const e: Event = {
        id: `e-${type}`,
        dayId: "d1",
        eventKey: `${type}_1`,
        type,
        kind: "instant",
        label: type,
        startTime: 14 * 60,
        hasPutdown: false,
        owner: NO_OWNER,
        lifecycle: { state: "projected" },
      };
      expect(isFutureProjected(e, 12 * 60)).toBe(false);
    }
  });
});

describe("isNextProjectedOfType (sick-day carve-out)", () => {
  const proj = (id: string, type: Event["type"], startTime: number, eventKey = id): Event => ({
    id,
    dayId: "d1",
    eventKey,
    type,
    kind: type === "bottle" ? "instant" : "block",
    label: id,
    startTime,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "projected" },
  });

  it("returns true for the earliest future projected nap (next in chain)", () => {
    const nap2 = proj("nap2", "nap", 14 * 60);
    const nap3 = proj("nap3", "nap", 16 * 60);
    expect(isNextProjectedOfType(nap2, [nap2, nap3], 12 * 60)).toBe(true);
  });

  it("returns false for a later projected nap (locked by the rule)", () => {
    const nap2 = proj("nap2", "nap", 14 * 60);
    const nap3 = proj("nap3", "nap", 16 * 60);
    expect(isNextProjectedOfType(nap3, [nap2, nap3], 12 * 60)).toBe(false);
  });

  it("returns true for the earliest future projected bottle (next in chain)", () => {
    const b2 = proj("b2", "bottle", 13 * 60, "bottle_2");
    const b3 = proj("b3", "bottle", 16 * 60, "bottle_3");
    expect(isNextProjectedOfType(b2, [b2, b3], 12 * 60)).toBe(true);
  });

  it("ignores the dream-feed slot when picking the next bottle", () => {
    const b2 = proj("b2", "bottle", 13 * 60, "bottle_2");
    const dream = proj("dream", "bottle", 11 * 60, "bottle_dream");
    // dream's startTime (11:00) is BEFORE b2 (13:00), but dream is
    // excluded from the next-of-type calculation. b2 still wins.
    expect(isNextProjectedOfType(b2, [b2, dream], 12 * 60)).toBe(true);
    expect(isNextProjectedOfType(dream, [b2, dream], 12 * 60)).toBe(false);
  });

  it("returns false when there's a recorded sibling — recorded events are not in the projected chain", () => {
    const recordedNap1: Event = {
      ...proj("nap1", "nap", 10 * 60),
      lifecycle: { state: "recorded", annotatedAt: 10 * 60 },
    };
    const nap2 = proj("nap2", "nap", 14 * 60);
    // nap2 is the next projected nap even though nap1 (recorded) is earlier.
    expect(isNextProjectedOfType(nap2, [recordedNap1, nap2], 12 * 60)).toBe(true);
  });

  it("returns false when the event is past Now (not future)", () => {
    const past = proj("past", "nap", 8 * 60);
    expect(isNextProjectedOfType(past, [past], 12 * 60)).toBe(false);
  });

  it("returns false for non-nap, non-bottle types (daycare, recurring, etc.)", () => {
    const daycare = proj("dc", "daycare_dropoff", 14 * 60);
    expect(isNextProjectedOfType(daycare, [daycare], 12 * 60)).toBe(false);
  });

  it("ignores render-synthetic putdown chips when picking the next nap", () => {
    // Synthetic putdown has type="nap" and an earlier startTime than the real nap.
    // Without the filter it wins the "earliest projected nap" lottery → drawer locks the real nap's input.
    const realNap = proj("nap2", "nap", 14 * 60);
    const putdownSynthetic: Event = {
      ...proj("putdown:nap2", "nap", 14 * 60 - 15),
      eventKey: "__putdown__", // PUTDOWN_KIND_TAG sentinel
    };
    expect(isNextProjectedOfType(realNap, [realNap, putdownSynthetic], 12 * 60)).toBe(true);
    expect(isNextProjectedOfType(putdownSynthetic, [realNap, putdownSynthetic], 12 * 60)).toBe(
      false,
    );
  });
});

function nap(id: string, startTime: number, endTime: number, life: Lifecycle = projected): Event {
  return {
    id,
    dayId: "d1",
    eventKey: id,
    type: "nap",
    kind: "block",
    label: id,
    startTime,
    endTime,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: life,
  };
}

function bottle(id: string, startTime: number, life: Lifecycle = projected): Event {
  return {
    id,
    dayId: "d1",
    eventKey: id,
    type: "bottle",
    kind: "instant",
    label: id,
    startTime,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: life,
  };
}

describe("isActiveNap", () => {
  it("true while start ≤ now < end", () => {
    expect(isActiveNap(nap("n", 13 * 60, 14 * 60), 13 * 60 + 30)).toBe(true);
  });

  it("true within the post-end grace window", () => {
    const n = nap("n", 13 * 60, 14 * 60);
    expect(isActiveNap(n, 14 * 60 + NAP_END_GRACE_MIN - 1)).toBe(true);
  });

  it("false once past end + grace", () => {
    const n = nap("n", 13 * 60, 14 * 60);
    expect(isActiveNap(n, 14 * 60 + NAP_END_GRACE_MIN)).toBe(false);
  });

  it("false before it starts", () => {
    expect(isActiveNap(nap("n", 14 * 60, 15 * 60), 13 * 60)).toBe(false);
  });
});

describe("isFocusNap", () => {
  it("the in-progress nap is the focus nap, not the upcoming one", () => {
    const inProgress = nap("n2", 13 * 60, 14 * 60);
    const upcoming = nap("n3", 15 * 60, 16 * 60);
    const all = [inProgress, upcoming];
    expect(isFocusNap(inProgress, all, 13 * 60 + 30)).toBe(true);
    expect(isFocusNap(upcoming, all, 13 * 60 + 30)).toBe(false);
  });

  it("with no active nap, the next-upcoming nap is the focus", () => {
    const past = nap("n1", 9 * 60, 10 * 60);
    const next = nap("n2", 14 * 60, 15 * 60);
    const later = nap("n3", 16 * 60, 17 * 60);
    const all = [past, next, later];
    expect(isFocusNap(next, all, 12 * 60)).toBe(true);
    expect(isFocusNap(later, all, 12 * 60)).toBe(false);
    expect(isFocusNap(past, all, 12 * 60)).toBe(false);
  });

  it("a just-ended nap stays the focus through the grace window (blocks the upcoming one)", () => {
    const justEnded = nap("n2", 13 * 60, 14 * 60);
    const upcoming = nap("n3", 15 * 60, 16 * 60);
    const all = [justEnded, upcoming];
    const now = 14 * 60 + 5;
    expect(isFocusNap(justEnded, all, now)).toBe(true);
    expect(isFocusNap(upcoming, all, now)).toBe(false);
  });
});

describe("isNearestBottle", () => {
  it("picks the bottle closest to now in either direction", () => {
    const past = bottle("b1", 11 * 60);
    const future = bottle("b2", 14 * 60);
    const all = [past, future];
    expect(isNearestBottle(past, all, 11 * 60 + 40)).toBe(true);
    expect(isNearestBottle(future, all, 11 * 60 + 40)).toBe(false);
  });

  it("excludes dream feed from nearest consideration", () => {
    const dream: Event = { ...bottle("bottle_dream", 23 * 60), eventKey: "bottle_dream" };
    const real = bottle("b2", 14 * 60);
    const all = [dream, real];
    expect(isNearestBottle(real, all, 22 * 60)).toBe(true);
    expect(isNearestBottle(dream, all, 22 * 60)).toBe(false);
  });
});

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

  // ── create mode (FAB-added events) ────────────────────────────────────────

  it("create mode + bottle at now → completed (committed reality)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "bottle",
        eventKind: "instant",
        timeChanged: false,
        hasEndTime: false,
        nowMinutes: NOW,
        mode: "create",
        startTime: NOW,
      },
    );
    expect(next).toEqual({ state: "completed", committedAt: NOW });
  });

  it("create mode + bottle in the future → recorded (scheduled)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "bottle",
        eventKind: "instant",
        timeChanged: false,
        hasEndTime: false,
        nowMinutes: NOW,
        mode: "create",
        startTime: NOW + 120,
      },
    );
    expect(next).toEqual({ state: "recorded", annotatedAt: NOW });
  });

  it("create mode + scheduling type (nap) at now → recorded (scheduling stays scheduled)", () => {
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "nap",
        eventKind: "block",
        timeChanged: false,
        hasEndTime: true,
        nowMinutes: NOW,
        mode: "create",
        startTime: NOW,
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
