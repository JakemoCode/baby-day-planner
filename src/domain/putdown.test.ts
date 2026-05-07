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
  recorded: false,
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
  recorded: false,
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
      recorded: false,
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
      recorded: false,
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

  it("emits putdown for naps regardless of source (projected, manual, or actual)", () => {
    // Putdown is a visual marker for the last 15 min before any nap, not a
    // forward-looking prediction. Manual edits (e.g. owner change via
    // /timeline) and recorded actuals should still get a putdown rendered.
    const sources = ["projected", "manual", "actual"] as const;
    for (const source of sources) {
      const events: Event[] = [{ ...napProjected(1, "09:00"), source, status: "actual" }];
      const result = addPutdownEvents(events, sampleSettings);
      expect(
        result.filter((e) => e.type === "putdown"),
        `source=${source} should still produce a putdown`,
      ).toHaveLength(1);
    }
  });

  it("emits putdown alongside an owner-stamped nap (regression: owner change shouldn't drop putdown)", () => {
    // Reproduces a real bug Jake hit: tapping a projected nap on /timeline
    // and assigning an owner created a manual override. The old source
    // filter then skipped putdown emission for that manual nap, so the
    // putdown vanished entirely. Putdown must survive owner edits.
    const owned: Event = {
      ...napProjected(1, "09:00"),
      source: "manual",
      status: "completed",
      owner: "Daycare",
    };
    const result = addPutdownEvents([owned], sampleSettings);
    const pd = result.find((e) => e.type === "putdown");
    expect(pd).toBeDefined();
    expect(pd?.startTime).toBe("08:45");
    expect(pd?.endTime).toBe("09:00");
    // applyTemplate later inherits owner via the nap_N_putdown key — at
    // this stage putdown is owner-less, that's expected.
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
        recorded: false,
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
