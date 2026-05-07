import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { addPutdownEvents } from "./putdown";
import { sampleSettings } from "./__fixtures__/sample";

const napProjected = (n: number, start: string): Event => ({
  id: `proj-day-1-nap-${n}`,
  dayId: "day-1",
  eventKey: `nap_${n}`,
  type: "nap",
  kind: "block",
  label: `Nap ${n}`,
  startTime: start,
  endTime: "00:00",
  owner: "Jake",
  source: "projected",
  status: "projected",
});

const bedtimeProjected = (start: string): Event => ({
  id: "proj-day-1-bedtime",
  dayId: "day-1",
  eventKey: "bedtime",
  type: "bedtime",
  kind: "instant",
  label: "Bedtime",
  startTime: start,
  source: "projected",
  status: "projected",
});

describe("addPutdownEvents", () => {
  it("inserts a putdown event 15 min before each projected nap", () => {
    const events: Event[] = [napProjected(1, "09:00"), napProjected(2, "12:15")];
    const result = addPutdownEvents(events, sampleSettings);
    const putdowns = result.filter((e) => e.type === "putdown");
    expect(putdowns).toHaveLength(2);
    expect(putdowns[0]).toMatchObject({
      type: "putdown",
      kind: "block",
      label: "Start putting down for Nap 1",
      startTime: "08:45",
      endTime: "09:00",
      owner: "Jake",
      source: "projected",
    });
    expect(putdowns[1]).toMatchObject({
      startTime: "12:00",
      endTime: "12:15",
      label: "Start putting down for Nap 2",
    });
  });

  it("inserts a putdown event 15 min before projected bedtime, same mechanic as naps", () => {
    const events: Event[] = [bedtimeProjected("19:00")];
    const result = addPutdownEvents(events, sampleSettings);
    const putdowns = result.filter((e) => e.type === "putdown");
    expect(putdowns).toHaveLength(1);
    expect(putdowns[0]).toMatchObject({
      type: "putdown",
      kind: "block",
      label: "Start putting down for Bedtime",
      startTime: "18:45",
      endTime: "19:00",
      source: "projected",
    });
  });

  it("uses configured putdownLeadMinutes", () => {
    const events: Event[] = [napProjected(1, "09:00")];
    const result = addPutdownEvents(events, { ...sampleSettings, putdownLeadMinutes: 30 });
    const pd = result.find((e) => e.type === "putdown");
    expect(pd?.startTime).toBe("08:30");
  });

  it("does not insert putdown for actual naps", () => {
    const events: Event[] = [{ ...napProjected(1, "09:00"), source: "actual", status: "actual" }];
    const result = addPutdownEvents(events, sampleSettings);
    expect(result.filter((e) => e.type === "putdown")).toHaveLength(0);
  });

  it("leaves non-sleep events untouched (no putdown for bottles, pumps, extras)", () => {
    const events: Event[] = [
      napProjected(1, "09:00"),
      {
        id: "x",
        dayId: "day-1",
        eventKey: "bottle_1",
        type: "bottle",
        kind: "instant",
        label: "Bottle 1",
        startTime: "07:05",
        source: "projected",
        status: "projected",
      },
    ];
    const result = addPutdownEvents(events, sampleSettings);
    expect(result.filter((e) => e.type === "putdown")).toHaveLength(1);
    expect(result.find((e) => e.type === "bottle")).toBeDefined();
  });
});
