import { describe, expect, it } from "vitest";
import { decideMode } from "./decideMode";
import { NO_OWNER, type Event, type TimeMin } from "@/v3/schemas";

const hm = (h: number, m = 0): TimeMin => h * 60 + m;

function inProgressNap(): Event {
  return {
    id: "recorded_nap_1",
    dayId: "day-1",
    eventKey: "nap_1",
    type: "nap",
    kind: "block",
    label: "Nap 1",
    startTime: hm(13),
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: hm(13) },
  };
}

function inProgressBedtime(): Event {
  return {
    id: "recorded_bedtime",
    dayId: "day-1",
    eventKey: "bedtime",
    type: "bedtime",
    kind: "block",
    label: "Bedtime",
    startTime: hm(19),
    endTime: hm(30),
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: hm(19) },
  };
}

describe("decideMode — sleep-only dashboard button", () => {
  it("returns hidden when no in-progress sleep", () => {
    expect(decideMode({})).toEqual({ kind: "hidden" });
  });

  it("returns end-nap when an in-progress nap exists", () => {
    const nap = inProgressNap();
    expect(decideMode({ inProgressNap: nap })).toEqual({ kind: "end-nap", nap });
  });

  it("returns end-bedtime when an in-progress bedtime exists", () => {
    const bedtime = inProgressBedtime();
    expect(decideMode({ inProgressBedtime: bedtime })).toEqual({ kind: "end-bedtime", bedtime });
  });

  it("end-bedtime wins when both an in-progress bedtime and nap are present", () => {
    const bedtime = inProgressBedtime();
    const nap = inProgressNap();
    expect(decideMode({ inProgressBedtime: bedtime, inProgressNap: nap }).kind).toBe("end-bedtime");
  });
});
