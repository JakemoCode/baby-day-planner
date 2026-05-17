/**
 * V3 Event defensive defaults — post-PR-C1.
 *
 * V2 bridge tests (string startTime coercion, source/status/recorded
 * triplet → lifecycle, V2 owner-string resolution) were removed when
 * the V2 surface was deleted. The defaulter now only handles defense
 * in depth on partial V3 docs.
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../schemas";
import { withV3EventDefaults } from "./eventDefaults";

describe("withV3EventDefaults", () => {
  it("passes through a fully-shaped V3 event unchanged (round-trip)", () => {
    const v3: Event = {
      id: "e-1",
      dayId: "d-1",
      eventKey: "bottle_1",
      type: "bottle",
      kind: "instant",
      startTime: 7 * 60 + 30,
      label: "Bottle 1",
      hasPutdown: false,
      lifecycle: { state: "completed", committedAt: 7 * 60 + 30 },
    };
    expect(withV3EventDefaults(v3)).toEqual(v3);
  });

  it("derives missing kind from type+endTime (nap/bedtime/wake_window are block)", () => {
    const partial: Partial<Event> = {
      id: "n-1",
      dayId: "d-1",
      eventKey: "nap_1",
      type: "nap",
      startTime: 9 * 60,
      endTime: 10 * 60,
      label: "Nap 1",
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
    expect(withV3EventDefaults(partial).kind).toBe("block");
  });

  it("derives kind=block for extras with endTime, kind=instant otherwise", () => {
    const extraBlock = withV3EventDefaults({
      type: "extra",
      startTime: 14 * 60,
      endTime: 15 * 60,
    });
    expect(extraBlock.kind).toBe("block");

    const extraInstant = withV3EventDefaults({ type: "extra", startTime: 14 * 60 });
    expect(extraInstant.kind).toBe("instant");
  });

  it("defaults hasPutdown to false when missing", () => {
    const partial: Partial<Event> = {
      id: "n-1",
      type: "nap",
      kind: "block",
      startTime: 9 * 60,
      endTime: 10 * 60,
      label: "Nap 1",
      lifecycle: { state: "projected" },
    };
    expect(withV3EventDefaults(partial).hasPutdown).toBe(false);
  });

  it("defaults lifecycle to projected when missing", () => {
    const out = withV3EventDefaults({ type: "bottle", startTime: 9 * 60 });
    expect(out.lifecycle).toEqual({ state: "projected" });
  });

  it("preserves optional fields (endTime, amountOz, owner) when present", () => {
    const out = withV3EventDefaults({
      type: "bottle",
      kind: "instant",
      startTime: 7 * 60 + 30,
      amountOz: 5,
      owner: { slot: "parent1" },
      lifecycle: { state: "completed", committedAt: 7 * 60 + 30 },
    });
    expect(out.amountOz).toBe(5);
    expect(out.owner).toEqual({ slot: "parent1" });
  });

  // Migration: pre-PR-#166 Firestore docs may have `state: "started"` or
  // `state: "overridden"`. Both meant "user-anchored event" and collapse
  // to the post-#166 `recorded` state at the read seam.
  describe("legacy lifecycle migration", () => {
    it("migrates state: 'started' → 'recorded' (committedAt → annotatedAt)", () => {
      const out = withV3EventDefaults({
        id: "nap-legacy",
        dayId: "d1",
        eventKey: "nap_1",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        endTime: 10 * 60,
        label: "Nap 1",
        hasPutdown: false,
        lifecycle: { state: "started", committedAt: 9 * 60 + 2 } as unknown as never,
      });
      expect(out.lifecycle).toEqual({ state: "recorded", annotatedAt: 9 * 60 + 2 });
    });

    it("migrates state: 'overridden' → 'recorded' (annotatedAt preserved)", () => {
      const out = withV3EventDefaults({
        id: "nap-legacy",
        dayId: "d1",
        eventKey: "nap_2",
        type: "nap",
        kind: "block",
        startTime: 13 * 60,
        endTime: 14 * 60,
        label: "Nap 2",
        hasPutdown: false,
        lifecycle: { state: "overridden", annotatedAt: 13 * 60 + 5 } as unknown as never,
      });
      expect(out.lifecycle).toEqual({ state: "recorded", annotatedAt: 13 * 60 + 5 });
    });

    it("uses startTime as annotatedAt fallback when legacy committedAt/annotatedAt is missing", () => {
      const out = withV3EventDefaults({
        id: "nap-no-time",
        dayId: "d1",
        eventKey: "nap_1",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        endTime: 10 * 60,
        label: "Nap 1",
        hasPutdown: false,
        lifecycle: { state: "started" } as unknown as never,
      });
      expect(out.lifecycle).toEqual({ state: "recorded", annotatedAt: 9 * 60 });
    });

    it("leaves modern lifecycle states unchanged", () => {
      const out = withV3EventDefaults({
        id: "nap-modern",
        dayId: "d1",
        eventKey: "nap_1",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        endTime: 10 * 60,
        label: "Nap 1",
        hasPutdown: false,
        lifecycle: { state: "completed", committedAt: 9 * 60 },
      });
      expect(out.lifecycle).toEqual({ state: "completed", committedAt: 9 * 60 });
    });
  });
});
