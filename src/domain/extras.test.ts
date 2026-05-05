import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { mergePumpsAndExtras } from "./extras";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";

describe("mergePumpsAndExtras", () => {
  it("emits pump events from settings.pumpTimes when no actuals exist", () => {
    const result = mergePumpsAndExtras([], [], sampleSettings, sampleDay);
    const pumps = result.filter((e) => e.type === "pump");
    expect(pumps.map((p) => p.startTime)).toEqual(["10:30", "14:30"]);
    expect(pumps[0]).toMatchObject({ source: "projected", label: "Pump" });
  });

  it("prefers actual pump events over projected ones when times overlap", () => {
    const actuals: Event[] = [
      {
        id: "actual-pump-1",
        dayId: sampleDay.id,
        eventKey: "pump_10:30",
        type: "pump",
        label: "Pump",
        startTime: "10:45",
        source: "actual",
        status: "actual",
      },
    ];
    const result = mergePumpsAndExtras([], actuals, sampleSettings, sampleDay);
    const pumps = result.filter((e) => e.type === "pump");
    expect(pumps.map((p) => p.startTime)).toEqual(["10:45", "14:30"]);
    expect(pumps.find((p) => p.startTime === "10:45")?.source).toBe("actual");
  });

  it("includes extra events with source 'manual'", () => {
    const extras: Event[] = [
      {
        id: "ex-1",
        dayId: sampleDay.id,
        eventKey: "extra_1",
        type: "extra",
        label: "Pediatrician",
        startTime: "11:00",
        source: "manual",
        status: "completed",
      },
    ];
    const result = mergePumpsAndExtras([], extras, sampleSettings, sampleDay);
    expect(result.find((e) => e.label === "Pediatrician")).toBeDefined();
  });

  it("does not duplicate pump events that already exist in input", () => {
    const existing: Event[] = [
      {
        id: "exist-pump",
        dayId: sampleDay.id,
        eventKey: "pump_10:30",
        type: "pump",
        label: "Pump",
        startTime: "10:30",
        source: "projected",
        status: "projected",
      },
    ];
    const result = mergePumpsAndExtras(existing, [], sampleSettings, sampleDay);
    const pumps = result.filter((e) => e.type === "pump");
    expect(pumps).toHaveLength(2);
  });
});
