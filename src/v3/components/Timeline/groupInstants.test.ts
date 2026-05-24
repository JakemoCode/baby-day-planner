/**
 * V3 groupInstants — bucket instant-kind events by startTime.
 * V2 keyed by string ("HH:MM"); V3 keys by TimeMin number directly.
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { groupInstants, mergeNearbyGroups } from "./groupInstants";

const ev = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "x",
  type: "bottle",
  kind: "instant",
  startTime: 0,
  label: "x",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("v3 groupInstants", () => {
  it("buckets instants firing at the same TimeMin together", () => {
    const groups = groupInstants([
      ev({ id: "a", startTime: 9 * 60, type: "bottle", label: "Bottle 1" }),
      ev({ id: "b", startTime: 9 * 60, type: "pump", label: "Pump 1" }),
      ev({ id: "c", startTime: 13 * 60, type: "bottle", label: "Bottle 2" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items.map((e) => e.id)).toEqual(["a", "b"]);
    expect(groups[1]?.items.map((e) => e.id)).toEqual(["c"]);
  });

  it("filters out block-kind events", () => {
    const groups = groupInstants([
      ev({ id: "blk", type: "nap", kind: "block", startTime: 9 * 60, endTime: 10 * 60 }),
      ev({ id: "bot", type: "bottle", kind: "instant", startTime: 9 * 60 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((e) => e.id)).toEqual(["bot"]);
  });

  it("sorts groups ascending by startMinutes", () => {
    const groups = groupInstants([
      ev({ id: "late", startTime: 18 * 60 }),
      ev({ id: "early", startTime: 7 * 60 }),
      ev({ id: "mid", startTime: 12 * 60 }),
    ]);
    expect(groups.map((g) => g.startMinutes)).toEqual([7 * 60, 12 * 60, 18 * 60]);
  });

  it("emits a stable string key suitable for React reconciliation", () => {
    const groups = groupInstants([ev({ id: "a", startTime: 9 * 60 })]);
    expect(groups[0]?.key).toBe("instant-group-540");
  });
});

describe("v3 mergeNearbyGroups (§F55)", () => {
  it("returns groups unchanged when none overlap vertically", () => {
    const groups = groupInstants([
      ev({ id: "a", startTime: 9 * 60 }),
      ev({ id: "b", startTime: 12 * 60 }),
    ]);
    const merged = mergeNearbyGroups(groups, 30);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.items.map((e) => e.id)).toEqual(["a"]);
    expect(merged[1]?.items.map((e) => e.id)).toEqual(["b"]);
  });

  it("merges two groups within the collision window into one", () => {
    const groups = groupInstants([
      ev({ id: "a", startTime: 9 * 60 }),
      ev({ id: "b", startTime: 9 * 60 + 5 }),
    ]);
    const merged = mergeNearbyGroups(groups, 15);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.items.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("transitively chains: A near B, B near C, all collapse into one", () => {
    const groups = groupInstants([
      ev({ id: "a", startTime: 9 * 60 }),
      ev({ id: "b", startTime: 9 * 60 + 8 }),
      ev({ id: "c", startTime: 9 * 60 + 15 }),
    ]);
    const merged = mergeNearbyGroups(groups, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.items.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("merged group startMinutes is the earliest member's startTime (axis anchor)", () => {
    const groups = groupInstants([
      ev({ id: "early", startTime: 9 * 60 }),
      ev({ id: "late", startTime: 9 * 60 + 7 }),
    ]);
    const merged = mergeNearbyGroups(groups, 15);
    expect(merged[0]?.startMinutes).toBe(9 * 60);
  });

  it("merged group preserves the full time range for display purposes", () => {
    const groups = groupInstants([
      ev({ id: "a", startTime: 9 * 60 }),
      ev({ id: "b", startTime: 9 * 60 + 5 }),
    ]);
    const merged = mergeNearbyGroups(groups, 15);
    expect(merged[0]?.endMinutes).toBe(9 * 60 + 5);
  });

  it("emits a stable key that distinguishes merged groups from single groups", () => {
    const groups = groupInstants([
      ev({ id: "a", startTime: 9 * 60 }),
      ev({ id: "b", startTime: 9 * 60 + 5 }),
    ]);
    const merged = mergeNearbyGroups(groups, 15);
    // Different key shape so React doesn't try to reuse a single-group DOM node
    expect(merged[0]?.key).not.toBe("instant-group-540");
    expect(merged[0]?.key).toContain("540");
  });

  it("does not merge across a gap exactly equal to the collision window", () => {
    // 30-min collision window; groups exactly 30 apart should NOT merge.
    // Strict less-than keeps the semantics easy to reason about at
    // exact thresholds (axis tick boundaries, etc.).
    const groups = groupInstants([
      ev({ id: "a", startTime: 9 * 60 }),
      ev({ id: "b", startTime: 9 * 60 + 30 }),
    ]);
    const merged = mergeNearbyGroups(groups, 30);
    expect(merged).toHaveLength(2);
  });
});
