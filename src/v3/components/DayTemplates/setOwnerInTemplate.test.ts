/**
 * setOwnerInTemplate — updates a single owner slot on an OwnershipTemplate
 * keyed by eventKey (`nap_N`, `wake_window_N`, `bottle_N`, `bedtime`).
 * Index is 1-based; out-of-bounds gaps are filled with undefined (R12.x skips them).
 * `owner === undefined` clears the slot; unknown/malformed keys return the template unchanged.
 */

import { describe, expect, it } from "vitest";
import type { Event, OwnerRef, OwnershipTemplate } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { setOwnerInTemplate } from "./setOwnerInTemplate";

const P1: OwnerRef = { slot: "parent1" };
const P2: OwnerRef = { slot: "parent2" };
const OTHER: OwnerRef = { slot: "other", otherId: "daycare" };

const baseTemplate: OwnershipTemplate = {
  id: "tpl-1",
  displayName: "Weekday",
  napOwners: [P1, P2],
  wakeWindowOwners: [P2, P1],
  bottleOwners: [P1],
  bedtimeOwner: P2,
};

const event = (eventKey: string): Event => ({
  id: `evt-${eventKey}`,
  dayId: "day-1",
  eventKey,
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: eventKey,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
});

describe("setOwnerInTemplate", () => {
  it("nap_1 updates napOwners[0]", () => {
    const next = setOwnerInTemplate(baseTemplate, event("nap_1"), OTHER);
    expect(next.napOwners[0]).toEqual(OTHER);
    expect(next.napOwners[1]).toEqual(P2);
  });

  it("nap_3 updates napOwners[2] and gap-fills intermediate slots with undefined", () => {
    const next = setOwnerInTemplate(baseTemplate, event("nap_3"), OTHER);
    expect(next.napOwners).toHaveLength(3);
    expect(next.napOwners[0]).toEqual(P1);
    expect(next.napOwners[1]).toEqual(P2);
    expect(next.napOwners[2]).toEqual(OTHER);
  });

  it("wake_window_1 updates wakeWindowOwners[0]", () => {
    const next = setOwnerInTemplate(baseTemplate, event("wake_window_1"), P1);
    expect(next.wakeWindowOwners[0]).toEqual(P1);
    expect(next.wakeWindowOwners[1]).toEqual(P1);
  });

  it("bottle_1 updates bottleOwners[0]", () => {
    const next = setOwnerInTemplate(baseTemplate, event("bottle_1"), P2);
    expect(next.bottleOwners?.[0]).toEqual(P2);
  });

  it("bottle_1 creates bottleOwners array when undefined", () => {
    const noBottles: OwnershipTemplate = {
      id: "tpl-2",
      displayName: "Bare",
      napOwners: [],
      wakeWindowOwners: [],
    };
    const next = setOwnerInTemplate(noBottles, event("bottle_1"), P1);
    expect(next.bottleOwners).toEqual([P1]);
  });

  it("bedtime sets bedtimeOwner", () => {
    const next = setOwnerInTemplate(baseTemplate, event("bedtime"), P1);
    expect(next.bedtimeOwner).toEqual(P1);
  });

  it("owner=undefined clears napOwners[N-1] in place", () => {
    const next = setOwnerInTemplate(baseTemplate, event("nap_1"), undefined);
    expect(next.napOwners[0]).toBeUndefined();
    expect(next.napOwners[1]).toEqual(P2);
  });

  it("owner=undefined clears bedtimeOwner via property removal", () => {
    const next = setOwnerInTemplate(baseTemplate, event("bedtime"), undefined);
    expect(next.bedtimeOwner).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(next, "bedtimeOwner")).toBe(false);
  });

  it("unknown eventKey returns the template unchanged", () => {
    const next = setOwnerInTemplate(baseTemplate, event("pump_1"), P1);
    expect(next).toBe(baseTemplate);
  });

  it("malformed eventKey (no index) returns the template unchanged", () => {
    const next = setOwnerInTemplate(baseTemplate, event("nap_"), P1);
    expect(next).toBe(baseTemplate);
  });

  it("does not mutate the input template", () => {
    const snapshot: OwnershipTemplate = JSON.parse(JSON.stringify(baseTemplate));
    setOwnerInTemplate(baseTemplate, event("nap_1"), OTHER);
    expect(baseTemplate).toEqual(snapshot);
  });
});
