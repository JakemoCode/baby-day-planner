/**
 * V3 groupInstants — bucket instant-kind events by startTime.
 * V2 keyed by string ("HH:MM"); V3 keys by TimeMin number directly.
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../../schemas";
import { groupInstants } from "./groupInstants";

const ev = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "x",
  type: "bottle",
  kind: "instant",
  startTime: 0,
  label: "x",
  hasPutdown: false,
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
