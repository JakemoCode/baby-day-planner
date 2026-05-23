import { describe, it, expect } from "vitest";
import type { Event, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import {
  bottleTotals,
  napTotals,
  lastBottle,
  lastCompletedNap,
  nextDashboardEvent,
} from "./dashboardStats";

const bottle = (overrides: Partial<Event> = {}): Event => ({
  id: `b-${overrides.startTime ?? 0}`,
  dayId: "d1",
  eventKey: `bottle_${overrides.startTime ?? 0}`,
  type: "bottle",
  kind: "instant",
  label: "Bottle",
  startTime: (overrides.startTime ?? 7 * 60) as TimeMin,
  amountOz: 4,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "recorded", annotatedAt: (overrides.startTime ?? 7 * 60) as TimeMin },
  ...overrides,
});

const nap = (overrides: Partial<Event> = {}): Event => ({
  id: `n-${overrides.startTime ?? 0}`,
  dayId: "d1",
  eventKey: `nap_${overrides.startTime ?? 0}`,
  type: "nap",
  kind: "block",
  label: "Nap",
  startTime: (overrides.startTime ?? 9 * 60) as TimeMin,
  endTime: ((overrides.startTime ?? 9 * 60) + 60) as TimeMin,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "recorded", annotatedAt: (overrides.startTime ?? 9 * 60) as TimeMin },
  ...overrides,
});

const END_OF_DAY: TimeMin = (24 * 60) as TimeMin;

describe("bottleTotals", () => {
  it("counts only recorded bottles and sums amountOz", () => {
    const events: Event[] = [
      bottle({ startTime: (7 * 60) as TimeMin, amountOz: 4 }),
      bottle({ startTime: (10 * 60) as TimeMin, amountOz: 5 }),
      bottle({
        startTime: (13 * 60) as TimeMin,
        amountOz: 6,
        lifecycle: { state: "projected" },
      }),
    ];
    expect(bottleTotals(events, END_OF_DAY)).toEqual({ count: 2, oz: 9 });
  });

  it("treats missing amountOz as 0", () => {
    const events: Event[] = [bottle({ amountOz: undefined as unknown as number })];
    expect(bottleTotals(events, END_OF_DAY)).toEqual({ count: 1, oz: 0 });
  });

  it("returns 0/0 for no bottles", () => {
    expect(bottleTotals([], END_OF_DAY)).toEqual({ count: 0, oz: 0 });
  });

  // §F48b regression: a bottle back-edited to a future startTime must
  // not inflate today's count or oz total.
  it("excludes bottles whose startTime is in the future relative to now", () => {
    const now = (14 * 60) as TimeMin;
    const events: Event[] = [
      bottle({ startTime: (8 * 60) as TimeMin, amountOz: 4 }),
      bottle({ startTime: (16 * 60) as TimeMin, amountOz: 6 }), // future
    ];
    expect(bottleTotals(events, now)).toEqual({ count: 1, oz: 4 });
  });
});

describe("napTotals", () => {
  it("counts only recorded naps and sums (endTime - startTime)", () => {
    const events: Event[] = [
      nap({ startTime: (9 * 60) as TimeMin, endTime: (10 * 60) as TimeMin }),
      nap({ startTime: (13 * 60) as TimeMin, endTime: (14 * 60 + 18) as TimeMin }),
      nap({
        startTime: (16 * 60) as TimeMin,
        endTime: (17 * 60) as TimeMin,
        lifecycle: { state: "projected" },
      }),
    ];
    expect(napTotals(events, END_OF_DAY)).toEqual({ count: 2, totalMinutes: 60 + 78 });
  });

  // §F48c regression: a nap back-edited to a future endTime must not
  // inflate today's count or totalMinutes.
  it("excludes naps whose endTime is in the future relative to now", () => {
    const now = (14 * 60 + 30) as TimeMin;
    const events: Event[] = [
      nap({ startTime: (9 * 60) as TimeMin, endTime: (10 * 60) as TimeMin }),
      // User back-edited a nap's endTime to 4:02pm (in the future).
      nap({ startTime: (13 * 60 + 15) as TimeMin, endTime: (16 * 60 + 2) as TimeMin }),
    ];
    expect(napTotals(events, now)).toEqual({ count: 1, totalMinutes: 60 });
  });
});

describe("lastBottle", () => {
  it("returns the highest-startTime recorded bottle", () => {
    const events: Event[] = [
      bottle({ startTime: (7 * 60) as TimeMin }),
      bottle({ startTime: (12 * 60) as TimeMin }),
      bottle({ startTime: (15 * 60) as TimeMin, lifecycle: { state: "projected" } }),
    ];
    expect(lastBottle(events, END_OF_DAY)?.startTime).toBe(12 * 60);
  });

  it("returns undefined when no recorded bottles", () => {
    expect(lastBottle([bottle({ lifecycle: { state: "projected" } })], END_OF_DAY)).toBeUndefined();
  });

  // §F48b regression: same shape as §F48 (lastCompletedNap) — a
  // bottle back-edited to a future startTime must not be returned as
  // "last bottle" or NextBottlePanel renders "Last: 4oz, 0 min ago
  // (4:00p)" at 2:30pm (Math.max(0, now - future) clamps the delta
  // while the clock string prints the future time).
  it("excludes bottles whose startTime is in the future relative to now", () => {
    const now = (14 * 60) as TimeMin;
    const events: Event[] = [
      bottle({ startTime: (8 * 60) as TimeMin }),
      bottle({ startTime: (16 * 60) as TimeMin }), // future
    ];
    expect(lastBottle(events, now)?.startTime).toBe(8 * 60);
  });

  it("returns undefined when all recorded bottles have future startTimes", () => {
    const now = (14 * 60) as TimeMin;
    const events: Event[] = [bottle({ startTime: (16 * 60) as TimeMin })];
    expect(lastBottle(events, now)).toBeUndefined();
  });
});

describe("lastCompletedNap", () => {
  it("returns the highest-endTime recorded nap with defined endTime", () => {
    const events: Event[] = [
      nap({ startTime: (9 * 60) as TimeMin, endTime: (10 * 60) as TimeMin }),
      nap({ startTime: (13 * 60) as TimeMin, endTime: (14 * 60) as TimeMin }),
    ];
    expect(lastCompletedNap(events, (15 * 60) as TimeMin)?.endTime).toBe(14 * 60);
  });

  // §F48 regression: a nap back-edited to a future endTime must be
  // excluded so the "Last nap" line doesn't render a future time
  // clamped to "0 min ago".
  it("excludes naps whose endTime is in the future relative to now", () => {
    const now = (14 * 60 + 30) as TimeMin; // 2:30pm
    const events: Event[] = [
      nap({ startTime: (9 * 60) as TimeMin, endTime: (10 * 60) as TimeMin }),
      // User back-edited a nap's endTime to 4:02pm (in the future).
      nap({ startTime: (13 * 60 + 15) as TimeMin, endTime: (16 * 60 + 2) as TimeMin }),
    ];
    const result = lastCompletedNap(events, now);
    expect(result?.endTime).toBe(10 * 60);
  });

  it("returns undefined when all recorded naps have future endTimes", () => {
    const now = (14 * 60) as TimeMin;
    const events: Event[] = [
      nap({ startTime: (13 * 60) as TimeMin, endTime: (16 * 60) as TimeMin }),
    ];
    expect(lastCompletedNap(events, now)).toBeUndefined();
  });
});

describe("nextDashboardEvent", () => {
  it("returns the next bottle/nap/bedtime — filters wake_window and pump", () => {
    const events: Event[] = [
      {
        id: "ww",
        dayId: "d1",
        eventKey: "wake_window_1",
        type: "wake_window",
        kind: "block",
        label: "Wake Window 1",
        startTime: (8 * 60) as TimeMin,
        endTime: (9 * 60) as TimeMin,
        hasPutdown: false,
        owner: NO_OWNER,
        lifecycle: { state: "projected" },
      },
      bottle({ startTime: (9 * 60) as TimeMin }),
    ];
    const next = nextDashboardEvent(events, (8 * 60 + 30) as TimeMin);
    expect(next?.type).toBe("bottle");
  });

  it("skips synthetic putdown render-blocks (carry parent type, but eventKey === PUTDOWN_KIND_TAG)", () => {
    const realNap = nap({
      startTime: (11 * 60) as TimeMin,
      endTime: (12 * 60) as TimeMin,
    });
    // Synthetic putdown matches engine putdown shape: parent's type,
    // sentinel eventKey, startTime = parent.startTime - leadMinutes.
    const syntheticPutdown: Event = {
      id: `putdown:${realNap.id}`,
      dayId: "d1",
      eventKey: "__putdown__",
      type: "nap",
      kind: "block",
      label: "Putdown",
      startTime: (10 * 60 + 45) as TimeMin,
      endTime: (11 * 60) as TimeMin,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    const next = nextDashboardEvent([syntheticPutdown, realNap], (10 * 60 + 30) as TimeMin);
    expect(next?.id).toBe(realNap.id);
    expect(next?.label).not.toBe("Putdown");
  });

  it("skips an in-progress nap and returns the event AFTER its endTime", () => {
    const events: Event[] = [
      nap({ startTime: (13 * 60) as TimeMin, endTime: (14 * 60) as TimeMin }),
      bottle({ startTime: (14 * 60 + 30) as TimeMin }),
    ];
    const next = nextDashboardEvent(events, (13 * 60 + 30) as TimeMin);
    expect(next?.type).toBe("bottle");
    expect(next?.startTime).toBe(14 * 60 + 30);
  });

  it("returns undefined when nothing is left", () => {
    const events: Event[] = [bottle({ startTime: (7 * 60) as TimeMin })];
    expect(nextDashboardEvent(events, (20 * 60) as TimeMin)).toBeUndefined();
  });
});
