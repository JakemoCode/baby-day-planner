import { describe, expect, it } from "vitest";
import type { Event, Lifecycle } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import {
  canDeleteEvent,
  hasSuppressionDelete,
  isAutoPromotedBottleEvent,
  isAutoPromotedSleep,
} from "./drawerDeletePolicy";

function ev(overrides: Partial<Event> = {}): Event {
  return {
    id: "recorded_bottle_1",
    dayId: "day-1",
    eventKey: "bottle_1",
    type: "bottle",
    kind: "instant",
    startTime: 480,
    label: "Bottle 1",
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "projected" },
    ...overrides,
  };
}

const recorded = (annotatedAt: number): Lifecycle => ({ state: "recorded", annotatedAt });
const completed = (committedAt: number): Lifecycle => ({ state: "completed", committedAt });

describe("hasSuppressionDelete", () => {
  it("is true for daily_recurring", () => {
    expect(hasSuppressionDelete(ev({ type: "daily_recurring", eventKey: "recurring:tummy" }))).toBe(
      true,
    );
  });

  it("is true for both daycare halves", () => {
    expect(hasSuppressionDelete(ev({ type: "daycare_dropoff", eventKey: "daycare_dropoff" }))).toBe(
      true,
    );
    expect(hasSuppressionDelete(ev({ type: "daycare_pickup", eventKey: "daycare_pickup" }))).toBe(
      true,
    );
  });

  it("is true for the dream-feed bottle slot", () => {
    expect(hasSuppressionDelete(ev({ type: "bottle", eventKey: "bottle_dream" }))).toBe(true);
  });

  it("is false for a normal rhythm bottle", () => {
    expect(hasSuppressionDelete(ev({ type: "bottle", eventKey: "bottle_1" }))).toBe(false);
  });

  it("is false for a nap", () => {
    expect(hasSuppressionDelete(ev({ type: "nap", eventKey: "nap_1" }))).toBe(false);
  });
});

describe("isAutoPromotedSleep", () => {
  it("is true for a nap with an engine-emitted id", () => {
    expect(isAutoPromotedSleep(ev({ type: "nap", id: "proj_nap_1" }))).toBe(true);
  });

  it("is true for a bedtime with an engine-emitted id", () => {
    expect(isAutoPromotedSleep(ev({ type: "bedtime", id: "proj_bedtime" }))).toBe(true);
  });

  it("is false once the sleep event has a persisted (non-proj) id", () => {
    expect(isAutoPromotedSleep(ev({ type: "nap", id: "recorded_nap_1" }))).toBe(false);
  });

  it("is false for a bottle even with an engine-emitted id", () => {
    expect(isAutoPromotedSleep(ev({ type: "bottle", id: "proj_bottle_1" }))).toBe(false);
  });
});

describe("isAutoPromotedBottleEvent", () => {
  it("is true when recorded with annotatedAt === startTime (the auto-promote signature)", () => {
    expect(
      isAutoPromotedBottleEvent(ev({ type: "bottle", startTime: 480, lifecycle: recorded(480) })),
    ).toBe(true);
  });

  it("is false when annotatedAt differs from startTime (a manual drawer save bumps it to now)", () => {
    expect(
      isAutoPromotedBottleEvent(ev({ type: "bottle", startTime: 480, lifecycle: recorded(495) })),
    ).toBe(false);
  });

  it("is false for a completed bottle (manual Log Bottle Now)", () => {
    expect(isAutoPromotedBottleEvent(ev({ type: "bottle", lifecycle: completed(480) }))).toBe(
      false,
    );
  });

  it("is false for the dream-feed slot even when its lifecycle matches the signature", () => {
    expect(
      isAutoPromotedBottleEvent(
        ev({ type: "bottle", eventKey: "bottle_dream", startTime: 480, lifecycle: recorded(480) }),
      ),
    ).toBe(false);
  });

  it("is false for a projected bottle", () => {
    expect(
      isAutoPromotedBottleEvent(ev({ type: "bottle", lifecycle: { state: "projected" } })),
    ).toBe(false);
  });
});

describe("canDeleteEvent", () => {
  const opts = { mode: "edit" as const, hasOnDelete: true };

  it("is false in create mode", () => {
    expect(
      canDeleteEvent(ev({ lifecycle: recorded(480) }), { mode: "create", hasOnDelete: true }),
    ).toBe(false);
  });

  it("is false when no onDelete handler is wired", () => {
    expect(
      canDeleteEvent(ev({ lifecycle: recorded(480) }), { mode: "edit", hasOnDelete: false }),
    ).toBe(false);
  });

  it("is true for a real recorded event (has a deletable doc)", () => {
    expect(
      canDeleteEvent(ev({ type: "bottle", startTime: 480, lifecycle: recorded(495) }), opts),
    ).toBe(true);
  });

  it("is true for a projected daily_recurring (routes to suppression)", () => {
    expect(
      canDeleteEvent(
        ev({
          type: "daily_recurring",
          eventKey: "recurring:tummy",
          lifecycle: { state: "projected" },
        }),
        opts,
      ),
    ).toBe(true);
  });

  it("is true for a projected dream-feed bottle (suppression path, not daily_recurring)", () => {
    expect(
      canDeleteEvent(
        ev({ type: "bottle", eventKey: "bottle_dream", lifecycle: { state: "projected" } }),
        opts,
      ),
    ).toBe(true);
  });

  it("is false for a plain projected nap (no doc, no suppression path)", () => {
    expect(
      canDeleteEvent(
        ev({ type: "nap", eventKey: "nap_1", lifecycle: { state: "projected" } }),
        opts,
      ),
    ).toBe(false);
  });

  it("is false for an auto-promoted sleep event (delete would be a visual no-op)", () => {
    expect(
      canDeleteEvent(ev({ type: "nap", id: "proj_nap_1", lifecycle: recorded(420) }), opts),
    ).toBe(false);
  });

  it("is false for an auto-promoted bottle (cascade re-emits it next pass)", () => {
    expect(
      canDeleteEvent(ev({ type: "bottle", startTime: 480, lifecycle: recorded(480) }), opts),
    ).toBe(false);
  });
});
