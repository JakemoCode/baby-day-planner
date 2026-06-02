import { describe, expect, it } from "vitest";
import type { Event, Lifecycle } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import {
  canDeleteEvent,
  drawerDestructiveAction,
  hasSuppressionDelete,
} from "./drawerDeletePolicy";

function ev(overrides: Partial<Event> = {}): Event {
  return {
    id: "recorded_bottle_t480",
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
});

describe("drawerDestructiveAction", () => {
  const opts = { mode: "edit" as const, hasOnDelete: true };

  it("is none in create mode", () => {
    expect(
      drawerDestructiveAction(ev({ lifecycle: recorded(480) }), { ...opts, mode: "create" }),
    ).toBe("none");
  });

  it("is none when no onDelete handler is wired", () => {
    expect(
      drawerDestructiveAction(ev({ lifecycle: recorded(480) }), { ...opts, hasOnDelete: false }),
    ).toBe("none");
  });

  // §F70: an auto-promoted wake_window has a proj_ id (no doc) — must offer no button.
  it("is none for an engine-emitted wake_window (auto-promoted, no doc)", () => {
    expect(
      drawerDestructiveAction(
        ev({
          type: "wake_window",
          id: "proj_wake_window_2",
          eventKey: "wake_window_2",
          lifecycle: recorded(540),
        }),
        opts,
      ),
    ).toBe("none");
  });

  it("is none for an engine-emitted (auto-promoted) nap with no doc", () => {
    expect(
      drawerDestructiveAction(
        ev({ type: "nap", id: "proj_nap_1", eventKey: "nap_1", lifecycle: recorded(420) }),
        opts,
      ),
    ).toBe("none");
  });

  it("is none for a plain projected nap (no doc, no suppression)", () => {
    expect(
      drawerDestructiveAction(
        ev({ type: "nap", id: "proj_nap_1", eventKey: "nap_1", lifecycle: { state: "projected" } }),
        opts,
      ),
    ).toBe("none");
  });

  // §F71: recorded rhythm slots revert to projection → "reset".
  it("is reset for a recorded nap occupying its cascade slot", () => {
    expect(
      drawerDestructiveAction(
        ev({ type: "nap", id: "recorded_nap_1", eventKey: "nap_1", lifecycle: recorded(420) }),
        opts,
      ),
    ).toBe("reset");
  });

  it("is reset for an auto-promoted bottle with a persisted slot doc", () => {
    expect(
      drawerDestructiveAction(
        ev({
          type: "bottle",
          id: "recorded_bottle_t480",
          eventKey: "bottle_1",
          startTime: 480,
          lifecycle: recorded(480),
        }),
        opts,
      ),
    ).toBe("reset");
  });

  it("is reset for a hand-edited (completed) cascade bottle", () => {
    expect(
      drawerDestructiveAction(
        ev({
          type: "bottle",
          id: "recorded_bottle_t500",
          eventKey: "bottle_2",
          startTime: 500,
          lifecycle: completed(500),
        }),
        opts,
      ),
    ).toBe("reset");
  });

  // A FAB-created one-off bottle has a uuid id, not the deterministic recorded_<eventKey> — truly delete.
  it("is delete for a user-added one-off bottle (uuid id)", () => {
    expect(
      drawerDestructiveAction(
        ev({
          type: "bottle",
          id: "bottle_9f3c-uuid",
          eventKey: "bottle_5",
          lifecycle: completed(500),
        }),
        opts,
      ),
    ).toBe("delete");
  });

  it("is reset for a recorded bedtime in its cascade slot", () => {
    expect(
      drawerDestructiveAction(
        ev({
          type: "bedtime",
          id: "recorded_bedtime",
          eventKey: "bedtime",
          lifecycle: recorded(1140),
        }),
        opts,
      ),
    ).toBe("reset");
  });

  it("is delete for a recorded extra event", () => {
    expect(
      drawerDestructiveAction(
        ev({ type: "extra", id: "extra_uuid", eventKey: "extra_uuid", lifecycle: completed(600) }),
        opts,
      ),
    ).toBe("delete");
  });

  // Suppression precedes the engine-emitted short-circuit: a projected (proj_) recurring
  // is still skippable for the day even though it has no doc.
  it("is delete (suppression) for a projected daily_recurring", () => {
    expect(
      drawerDestructiveAction(
        ev({
          type: "daily_recurring",
          id: "proj_recurring",
          eventKey: "recurring:tummy",
          lifecycle: { state: "projected" },
        }),
        opts,
      ),
    ).toBe("delete");
  });

  it("is delete (suppression) for a persisted daily_recurring doc", () => {
    expect(
      drawerDestructiveAction(
        ev({
          type: "daily_recurring",
          id: "recorded_recurring:tummy",
          eventKey: "recurring:tummy",
          lifecycle: recorded(600),
        }),
        opts,
      ),
    ).toBe("delete");
  });

  it("is delete for the dream-feed slot (suppression, never reset)", () => {
    expect(
      drawerDestructiveAction(
        ev({
          type: "bottle",
          id: "recorded_bottle_dream",
          eventKey: "bottle_dream",
          lifecycle: recorded(1380),
        }),
        opts,
      ),
    ).toBe("delete");
  });
});

describe("canDeleteEvent (visibility wrapper)", () => {
  const opts = { mode: "edit" as const, hasOnDelete: true };

  it("is true whenever an action exists (delete or reset)", () => {
    expect(canDeleteEvent(ev({ id: "recorded_bottle_1", lifecycle: recorded(480) }), opts)).toBe(
      true,
    );
  });

  it("is false when the action is none", () => {
    expect(
      canDeleteEvent(
        ev({ type: "nap", id: "proj_nap_1", lifecycle: { state: "projected" } }),
        opts,
      ),
    ).toBe(false);
  });
});
