/**
 * Tests for syntheticEvents.ts — canonical home for PUTDOWN_KIND_TAG
 * and the `isRenderSynthetic` predicate.
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";
import { PUTDOWN_KIND_TAG, isRenderSynthetic } from "./syntheticEvents";

const baseEvent = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "some_event_key",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("PUTDOWN_KIND_TAG", () => {
  it("has the same string value as the legacy location", () => {
    expect(PUTDOWN_KIND_TAG).toBe("__putdown__");
  });
});

describe("isRenderSynthetic", () => {
  it("returns true for an event with eventKey === PUTDOWN_KIND_TAG", () => {
    const synthetic = baseEvent({ eventKey: PUTDOWN_KIND_TAG });
    expect(isRenderSynthetic(synthetic)).toBe(true);
  });

  it("returns false for a bottle event", () => {
    const bottle = baseEvent({ type: "bottle", eventKey: "bottle_1" });
    expect(isRenderSynthetic(bottle)).toBe(false);
  });

  it("returns false for a nap event", () => {
    const nap = baseEvent({ type: "nap", eventKey: "nap_1" });
    expect(isRenderSynthetic(nap)).toBe(false);
  });
});
