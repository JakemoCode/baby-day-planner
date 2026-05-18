/**
 * templateSlot dispatch — covers each slot kind plus the
 * "doesn't map to a slot" cases (extras, pumps, malformed keys).
 * The setOwnerAt round-trip is verified incidentally via the
 * existing setOwnerInTemplate.test.ts; here we exercise the
 * dispatch directly so the contract is documented in one place.
 */

import { describe, expect, it } from "vitest";
import type { Event, OwnerRef, OwnershipTemplate } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { getOwnerAt, setOwnerAt, templateSlotForEvent } from "./templateSlot";

const P1: OwnerRef = { slot: "parent1" };
const P2: OwnerRef = { slot: "parent2" };
const OTHER: OwnerRef = { slot: "other", otherId: "daycare" };

const template: OwnershipTemplate = {
  id: "tpl-1",
  displayName: "Weekday",
  napOwners: [P1, P2],
  wakeWindowOwners: [P2, P1],
  bottleOwners: [P1],
  bedtimeOwner: P2,
};

const event = (eventKey: string, type: Event["type"] = "nap"): Event => ({
  id: `evt-${eventKey}`,
  dayId: "day-1",
  eventKey,
  type,
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: eventKey,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
});

describe("templateSlotForEvent", () => {
  it("maps nap_N to nap slot at index N-1", () => {
    expect(templateSlotForEvent(event("nap_1"))).toEqual({ kind: "nap", index: 0 });
    expect(templateSlotForEvent(event("nap_3"))).toEqual({ kind: "nap", index: 2 });
  });

  it("maps wake_window_N to wakeWindow slot at index N-1", () => {
    expect(templateSlotForEvent(event("wake_window_1"))).toEqual({
      kind: "wakeWindow",
      index: 0,
    });
  });

  it("maps bottle_N to bottle slot at index N-1", () => {
    expect(templateSlotForEvent(event("bottle_2"))).toEqual({ kind: "bottle", index: 1 });
  });

  it("maps bedtime to the bedtime slot", () => {
    expect(templateSlotForEvent(event("bedtime", "bedtime"))).toEqual({ kind: "bedtime" });
  });

  it("returns undefined for extras", () => {
    expect(templateSlotForEvent(event("extra_breakfast", "extra"))).toBeUndefined();
  });

  it("returns undefined for pumps", () => {
    expect(templateSlotForEvent(event("pump_1", "pump"))).toBeUndefined();
  });

  it("returns undefined for malformed eventKey (no index)", () => {
    expect(templateSlotForEvent(event("nap_"))).toBeUndefined();
  });
});

describe("getOwnerAt", () => {
  it("reads bedtime owner", () => {
    expect(getOwnerAt(template, { kind: "bedtime" })).toEqual(P2);
  });

  it("reads nap owner by index", () => {
    expect(getOwnerAt(template, { kind: "nap", index: 0 })).toEqual(P1);
    expect(getOwnerAt(template, { kind: "nap", index: 1 })).toEqual(P2);
  });

  it("reads wakeWindow owner by index", () => {
    expect(getOwnerAt(template, { kind: "wakeWindow", index: 0 })).toEqual(P2);
  });

  it("reads bottle owner by index", () => {
    expect(getOwnerAt(template, { kind: "bottle", index: 0 })).toEqual(P1);
  });

  it("returns undefined for out-of-bounds index", () => {
    expect(getOwnerAt(template, { kind: "nap", index: 99 })).toBeUndefined();
  });

  it("returns undefined for bottle when bottleOwners is missing", () => {
    const bare: OwnershipTemplate = {
      id: "t",
      displayName: "Bare",
      napOwners: [],
      wakeWindowOwners: [],
    };
    expect(getOwnerAt(bare, { kind: "bottle", index: 0 })).toBeUndefined();
  });
});

describe("setOwnerAt", () => {
  it("replaces nap owner immutably", () => {
    const next = setOwnerAt(template, { kind: "nap", index: 0 }, OTHER);
    expect(next.napOwners[0]).toEqual(OTHER);
    expect(template.napOwners[0]).toEqual(P1);
  });

  it("clears bedtime by removing the property", () => {
    const next = setOwnerAt(template, { kind: "bedtime" }, undefined);
    expect(Object.prototype.hasOwnProperty.call(next, "bedtimeOwner")).toBe(false);
  });

  it("gap-fills nap slots with undefined when index exceeds length", () => {
    const next = setOwnerAt(template, { kind: "nap", index: 4 }, OTHER);
    expect(next.napOwners).toHaveLength(5);
    expect(next.napOwners[4]).toEqual(OTHER);
  });
});
