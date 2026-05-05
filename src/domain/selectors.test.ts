import { describe, it, expect } from "vitest";
import {
  nextEvent,
  nextBottle,
  nextNap,
  currentWakeWindow,
  projectedBedtime,
} from "./selectors";
import { projectDay } from "./project";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";
import { parseTime } from "./time";

const projected = projectDay({ day: sampleDay, settings: sampleSettings, actuals: [] });

describe("nextEvent", () => {
  it("returns the first event whose startTime > now (excluding wake_window)", () => {
    const result = nextEvent(projected, parseTime("08:30"));
    expect(result?.startTime).toBe("08:45");
    expect(result?.type).toBe("putdown");
  });

  it("returns undefined when day is over", () => {
    expect(nextEvent(projected, parseTime("23:59"))).toBeUndefined();
  });
});

describe("nextBottle", () => {
  it("returns the next projected or actual bottle whose start ≥ now", () => {
    const events = projected.concat([
      {
        id: "b2",
        dayId: sampleDay.id,
        eventKey: "bottle_2",
        type: "bottle",
        label: "Bottle 2",
        startTime: "11:05",
        amountOz: 5,
        source: "projected",
        status: "projected",
      },
    ]);
    const result = nextBottle(events, parseTime("09:00"));
    expect(result?.startTime).toBe("11:05");
  });

  it("returns undefined when no bottle after now", () => {
    expect(nextBottle(projected, parseTime("23:00"))).toBeUndefined();
  });
});

describe("nextNap", () => {
  it("returns the next nap whose start ≥ now", () => {
    const result = nextNap(projected, parseTime("10:00"));
    expect(result?.startTime).toBe("12:15");
  });
});

describe("currentWakeWindow", () => {
  it("returns the wake window containing now", () => {
    const result = currentWakeWindow(projected, parseTime("08:00"));
    expect(result?.eventKey).toBe("wake_window_1");
  });

  it("returns undefined when in a nap", () => {
    expect(currentWakeWindow(projected, parseTime("09:30"))).toBeUndefined();
  });
});

describe("projectedBedtime", () => {
  it("returns the bedtime startTime when present", () => {
    expect(projectedBedtime(projected)).toBe("19:00");
  });

  it("returns undefined when none projected", () => {
    expect(projectedBedtime([])).toBeUndefined();
  });
});
