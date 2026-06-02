import { describe, expect, it } from "vitest";
import {
  DREAM_FEED_EVENT_KEY,
  ownerOverrideKeyFor,
  recordedIdForEvent,
  recordedIdFor,
} from "./eventConventions";

type IdShape = Pick<Parameters<typeof recordedIdForEvent>[0], "type" | "eventKey" | "startTime">;

const ev = (o: IdShape) => o;

describe("recordedIdForEvent — durable doc id by create-mode (ADR-0007)", () => {
  it("a renumberable bottle keys off startTime, never the slot eventKey", () => {
    const id = recordedIdForEvent(ev({ type: "bottle", eventKey: "bottle_5", startTime: 615 }));
    expect(id).toBe("recorded_bottle_t615");
  });

  it("two clients with divergent slot keys for the same feed converge to one id", () => {
    const clientA = recordedIdForEvent(
      ev({ type: "bottle", eventKey: "bottle_2", startTime: 600 }),
    );
    const clientB = recordedIdForEvent(
      ev({ type: "bottle", eventKey: "bottle_4", startTime: 600 }),
    );
    expect(clientA).toBe(clientB);
  });

  it("naps keep the slot-anchored recorded_<eventKey> id (their keys don't renumber)", () => {
    const id = recordedIdForEvent(ev({ type: "nap", eventKey: "nap_2", startTime: 540 }));
    expect(id).toBe(recordedIdFor("nap_2"));
  });

  it("bedtime keeps recorded_<eventKey>", () => {
    const id = recordedIdForEvent(ev({ type: "bedtime", eventKey: "bedtime", startTime: 1200 }));
    expect(id).toBe(recordedIdFor("bedtime"));
  });

  it("dream-feed is a bottle but its eventKey is stable, so it keeps recorded_<eventKey>", () => {
    const id = recordedIdForEvent(
      ev({ type: "bottle", eventKey: DREAM_FEED_EVENT_KEY, startTime: 1320 }),
    );
    expect(id).toBe(recordedIdFor(DREAM_FEED_EVENT_KEY));
  });
});

describe("ownerOverrideKeyFor — per-day owner-override key (§F66 / ADR-0007)", () => {
  it("a bottle keys off chronological position from its label, not the slot eventKey", () => {
    expect(ownerOverrideKeyFor({ type: "bottle", eventKey: "bottle_5", label: "Bottle 2" })).toBe(
      "bottle_pos_2",
    );
  });

  it("naps key off their stable eventKey", () => {
    expect(ownerOverrideKeyFor({ type: "nap", eventKey: "nap_3", label: "Nap 3" })).toBe("nap_3");
  });

  it("dream-feed keeps its eventKey (stable, not renumbered)", () => {
    expect(
      ownerOverrideKeyFor({ type: "bottle", eventKey: DREAM_FEED_EVENT_KEY, label: "Dream Feed" }),
    ).toBe(DREAM_FEED_EVENT_KEY);
  });

  it("falls back to eventKey for a bottle with a non-positional label", () => {
    expect(ownerOverrideKeyFor({ type: "bottle", eventKey: "bottle_1", label: "Bottle" })).toBe(
      "bottle_1",
    );
  });
});
