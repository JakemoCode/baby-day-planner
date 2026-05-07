import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { applyWakeWindowOverrides } from "./wakeWindowOverrides";

const ww = (n: number, owner?: Event["owner"]): Event => ({
  id: `proj-day-1-ww-${n}`,
  dayId: "day-1",
  eventKey: `wake_window_${n}`,
  type: "wake_window",
  label: `Wake Window ${n}`,
  startTime: "09:00",
  endTime: "10:00",
  source: "projected",
  status: "projected",
  ...(owner ? { owner } : {}),
});

const wwOverride = (n: number, owner: NonNullable<Event["owner"]>): Event => ({
  id: `manual-${Date.now()}-${n}`,
  dayId: "day-1",
  eventKey: `wake_window_${n}`,
  type: "wake_window",
  label: `Wake Window ${n}`,
  startTime: "09:00",
  endTime: "10:00",
  owner,
  source: "manual",
  status: "overridden",
});

describe("applyWakeWindowOverrides", () => {
  it("returns events unchanged when no manual wake_window actuals exist", () => {
    const events = [ww(1), ww(2)];
    expect(applyWakeWindowOverrides(events, [])).toBe(events);
  });

  it("replaces a projected wake_window with the matching manual override", () => {
    const events = [ww(1), ww(2)];
    const result = applyWakeWindowOverrides(events, [wwOverride(2, "Kelly")]);
    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.owner).toBe("Kelly");
    expect(ww2?.source).toBe("manual");
  });

  it("leaves wake_windows without a matching override alone", () => {
    const events = [ww(1, "Jake"), ww(2)];
    const result = applyWakeWindowOverrides(events, [wwOverride(2, "Kelly")]);
    const ww1 = result.find((e) => e.eventKey === "wake_window_1");
    expect(ww1?.owner).toBe("Jake");
    expect(ww1?.source).toBe("projected");
  });

  it("ignores non-wake_window actuals", () => {
    const events = [ww(1)];
    const napActual: Event = {
      id: "n1",
      dayId: "day-1",
      eventKey: "nap_1",
      type: "nap",
      label: "Nap 1",
      startTime: "10:00",
      endTime: "11:00",
      source: "actual",
      status: "actual",
    };
    expect(applyWakeWindowOverrides(events, [napActual])).toBe(events);
  });
});
