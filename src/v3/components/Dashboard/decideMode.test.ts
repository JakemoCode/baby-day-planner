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

function inProgressBedtime(overrides: Partial<Event> = {}): Event {
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
    ...overrides,
  };
}

describe("decideMode — sleep-only dashboard button", () => {
  it("returns hidden when no in-progress sleep", () => {
    expect(decideMode({ nowMinutes: hm(2) })).toEqual({ kind: "hidden" });
  });

  it("returns end-nap when an in-progress nap exists", () => {
    const nap = inProgressNap();
    expect(decideMode({ inProgressNap: nap, nowMinutes: hm(13, 30) })).toEqual({
      kind: "end-nap",
      nap,
    });
  });

  it("returns end-bedtime once the clock is past midnight (now < bedtime.start)", () => {
    const bedtime = inProgressBedtime();
    expect(decideMode({ inProgressBedtime: bedtime, nowMinutes: hm(2) })).toEqual({
      kind: "end-bedtime",
      bedtime,
    });
  });

  it("hides end-bedtime before midnight (now still ≥ bedtime.start, e.g. 8 PM)", () => {
    const bedtime = inProgressBedtime();
    expect(decideMode({ inProgressBedtime: bedtime, nowMinutes: hm(20) })).toEqual({
      kind: "hidden",
    });
  });

  it("shows end-bedtime for a bedtime logged AFTER midnight (it's already past midnight)", () => {
    // Baby down at 00:30; at 6 AM the CTA must still appear — it's the only way to
    // roll the day over. now(360) ≥ start(30) would falsely hide it without the AM case.
    const bedtime = inProgressBedtime({ startTime: hm(0, 30) });
    expect(decideMode({ inProgressBedtime: bedtime, nowMinutes: hm(6) }).kind).toBe("end-bedtime");
  });

  it("end-bedtime wins when both an in-progress bedtime and nap are present (after midnight)", () => {
    const bedtime = inProgressBedtime();
    const nap = inProgressNap();
    expect(
      decideMode({ inProgressBedtime: bedtime, inProgressNap: nap, nowMinutes: hm(2) }).kind,
    ).toBe("end-bedtime");
  });
});
