import { describe, it, expect } from "vitest";
import type { Event, TimeMin } from "@/v3/schemas";
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
  lifecycle: { state: "recorded", annotatedAt: (overrides.startTime ?? 9 * 60) as TimeMin },
  ...overrides,
});

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
    expect(bottleTotals(events)).toEqual({ count: 2, oz: 9 });
  });

  it("treats missing amountOz as 0", () => {
    const events: Event[] = [bottle({ amountOz: undefined as unknown as number })];
    expect(bottleTotals(events)).toEqual({ count: 1, oz: 0 });
  });

  it("returns 0/0 for no bottles", () => {
    expect(bottleTotals([])).toEqual({ count: 0, oz: 0 });
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
    expect(napTotals(events)).toEqual({ count: 2, totalMinutes: 60 + 78 });
  });
});

describe("lastBottle", () => {
  it("returns the highest-startTime recorded bottle", () => {
    const events: Event[] = [
      bottle({ startTime: (7 * 60) as TimeMin }),
      bottle({ startTime: (12 * 60) as TimeMin }),
      bottle({ startTime: (15 * 60) as TimeMin, lifecycle: { state: "projected" } }),
    ];
    expect(lastBottle(events)?.startTime).toBe(12 * 60);
  });

  it("returns undefined when no recorded bottles", () => {
    expect(lastBottle([bottle({ lifecycle: { state: "projected" } })])).toBeUndefined();
  });
});

describe("lastCompletedNap", () => {
  it("returns the highest-endTime recorded nap with defined endTime", () => {
    const events: Event[] = [
      nap({ startTime: (9 * 60) as TimeMin, endTime: (10 * 60) as TimeMin }),
      nap({ startTime: (13 * 60) as TimeMin, endTime: (14 * 60) as TimeMin }),
    ];
    expect(lastCompletedNap(events)?.endTime).toBe(14 * 60);
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
        lifecycle: { state: "projected" },
      },
      bottle({ startTime: (9 * 60) as TimeMin }),
    ];
    const next = nextDashboardEvent(events, (8 * 60 + 30) as TimeMin);
    expect(next?.type).toBe("bottle");
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
