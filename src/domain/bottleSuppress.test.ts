import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { suppressBottlesAfterBedtime } from "./bottleSuppress";
import { sampleSettings } from "./__fixtures__/sample";

const ev = (overrides: Partial<Event>): Event => ({
  id: "id",
  dayId: "day-1",
  eventKey: "x",
  type: "bottle",
  label: "x",
  startTime: "00:00",
  source: "projected",
  status: "projected",
  ...overrides,
});

describe("suppressBottlesAfterBedtime", () => {
  it("drops projected regular bottles at or after bedtime threshold", () => {
    const events = [
      ev({ id: "b1", eventKey: "bottle_1", startTime: "07:00", source: "actual", status: "actual" }),
      ev({ id: "b6", eventKey: "bottle_6", startTime: "19:00", source: "projected" }),
      ev({ id: "b7", eventKey: "bottle_7", startTime: "21:30", source: "projected" }),
    ];
    const result = suppressBottlesAfterBedtime(events, sampleSettings);
    expect(result.find((e) => e.id === "b6")).toBeUndefined();
    expect(result.find((e) => e.id === "b7")).toBeUndefined();
    expect(result.find((e) => e.id === "b1")).toBeDefined();
  });

  it("does not drop actual or manual bottles even past bedtime", () => {
    const events = [
      ev({ id: "b6", eventKey: "bottle_6", startTime: "19:30", source: "actual", status: "actual" }),
      ev({ id: "b7", eventKey: "bottle_7", startTime: "20:00", source: "manual", status: "overridden" }),
    ];
    const result = suppressBottlesAfterBedtime(events, sampleSettings);
    expect(result).toHaveLength(2);
  });

  it("does not affect dream feed events", () => {
    const events = [ev({ id: "df", eventKey: "dream_feed", type: "dream_feed", startTime: "20:30" })];
    const result = suppressBottlesAfterBedtime(events, sampleSettings);
    expect(result).toHaveLength(1);
  });
});
