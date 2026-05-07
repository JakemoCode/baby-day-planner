import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { mergePumpsAndExtras } from "./extras";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";

describe("mergePumpsAndExtras", () => {
  it("anchors the first pump to day.wakeTime; remaining come from settings.pumpTimes", () => {
    const result = mergePumpsAndExtras([], [], sampleSettings, sampleDay);
    const pumps = result.filter((e) => e.type === "pump");
    // sampleDay.wakeTime = "07:00"; sampleSettings.pumpTimes = ["10:30", "14:30"]
    // First scheduled pump (10:30) is replaced with wakeTime (07:00).
    expect(pumps.map((p) => p.startTime)).toEqual(["07:00", "14:30"]);
    expect(pumps[0]).toMatchObject({ source: "projected", label: "Pump" });
  });

  it("prefers actual pump events over projected ones when eventKey matches", () => {
    // The first projected pump now keys on wakeTime, so an actual matching
    // pump_07:00 should replace it.
    const actuals: Event[] = [
      {
        id: "actual-pump-1",
        dayId: sampleDay.id,
        eventKey: "pump_07:00",
        type: "pump",
        kind: "instant",
        label: "Pump",
        startTime: "07:15",
        source: "actual",
        status: "actual",
      },
    ];
    const result = mergePumpsAndExtras([], actuals, sampleSettings, sampleDay);
    const pumps = result.filter((e) => e.type === "pump");
    expect(pumps.map((p) => p.startTime)).toEqual(["07:15", "14:30"]);
    expect(pumps.find((p) => p.startTime === "07:15")?.source).toBe("actual");
  });

  it("includes extra events with source 'manual'", () => {
    const extras: Event[] = [
      {
        id: "ex-1",
        dayId: sampleDay.id,
        eventKey: "extra_1",
        type: "extra",
        kind: "instant",
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
        eventKey: "pump_07:00",
        type: "pump",
        kind: "instant",
        label: "Pump",
        startTime: "07:00",
        source: "projected",
        status: "projected",
      },
    ];
    const result = mergePumpsAndExtras(existing, [], sampleSettings, sampleDay);
    const pumps = result.filter((e) => e.type === "pump");
    expect(pumps).toHaveLength(2);
  });
});
