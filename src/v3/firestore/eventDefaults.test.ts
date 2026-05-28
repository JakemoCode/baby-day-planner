/**
 * V3 Event defensive defaults — post-PR-C1. V2 bridge tests were removed
 * when the V2 surface was deleted; defaulter now handles partial V3 docs only.
 */

import { describe, expect, it } from "vitest";
import { NO_OWNER, type Event } from "../schemas";
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
      owner: NO_OWNER,
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
});
