import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { applyNapActuals } from "./napActuals";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";
import { projectNapChain } from "./napChain";

const baseProj = projectNapChain(sampleDay, sampleSettings);

function actualNap(n: number, start: string, end: string): Event {
  return {
    id: `actual-nap-${n}`,
    dayId: sampleDay.id,
    eventKey: `nap_${n}`,
    type: "nap",
    kind: "block",
    label: `Nap ${n}`,
    startTime: start,
    endTime: end,
    source: "actual",
    status: "actual",
  };
}

describe("applyNapActuals", () => {
  it("returns the projection unchanged when no actuals provided", () => {
    expect(applyNapActuals(baseProj, [], sampleSettings)).toEqual(baseProj);
  });

  it("replaces projected nap with actual and re-anchors subsequent chain", () => {
    const actuals = [actualNap(1, "09:10", "10:15")];
    const result = applyNapActuals(baseProj, actuals, sampleSettings);

    const nap1 = result.find((e) => e.eventKey === "nap_1");
    expect(nap1).toMatchObject({ startTime: "09:10", endTime: "10:15", status: "actual" });

    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    expect(ww2).toMatchObject({ startTime: "10:15", endTime: "12:30" });

    const nap2 = result.find((e) => e.eventKey === "nap_2");
    expect(nap2).toMatchObject({ startTime: "12:30", endTime: "13:30" });
  });

  it("applies short-nap adjustment when nap duration < threshold", () => {
    const actuals = [actualNap(1, "09:00", "09:25")];
    const result = applyNapActuals(baseProj, actuals, sampleSettings);

    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    expect(ww2).toMatchObject({ startTime: "09:25", endTime: "11:30" });

    const nap2 = result.find((e) => e.eventKey === "nap_2");
    expect(nap2).toMatchObject({ startTime: "11:30", endTime: "12:30" });
  });

  it("does not adjust when nap exactly meets threshold", () => {
    const actuals = [actualNap(1, "09:00", "09:35")];
    const result = applyNapActuals(baseProj, actuals, sampleSettings);
    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    expect(ww2).toMatchObject({ startTime: "09:35", endTime: "11:50" });
  });

  it("treats actuals without endTime as 'in-progress' and leaves chain projected from default end", () => {
    const inProgress: Event = {
      id: `actual-nap-1`,
      dayId: sampleDay.id,
      eventKey: `nap_1`,
      type: "nap",
      kind: "block",
      label: `Nap 1`,
      startTime: "09:00",
      source: "actual",
      status: "actual",
    };
    const result = applyNapActuals(baseProj, [inProgress], sampleSettings);
    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe("10:00");
  });

  it("uses 00:00 as cursor when no wake event is present in projected list", () => {
    // Build a minimal projected list with no wake event, just ww_1 and nap_1
    const noWakeProj: Event[] = [
      {
        id: "ww1",
        dayId: sampleDay.id,
        eventKey: "wake_window_1",
        type: "wake_window",
        kind: "block",
        label: "Wake Window 1",
        startTime: "07:00",
        endTime: "09:00",
        source: "projected",
        status: "projected",
      },
      {
        id: "nap1",
        dayId: sampleDay.id,
        eventKey: "nap_1",
        type: "nap",
        kind: "block",
        label: "Nap 1",
        startTime: "09:00",
        endTime: "10:00",
        source: "projected",
        status: "projected",
      },
    ];
    const actuals = [actualNap(1, "09:10", "10:10")];
    const result = applyNapActuals(noWakeProj, actuals, sampleSettings);
    const ww1 = result.find((e) => e.eventKey === "wake_window_1");
    // ww_1 starts from "00:00" (cursor fallback). Its end stretches to the
    // actual nap_1 start (09:10) since the projected duration (120min →
    // 02:00) is well before reality — the stretch behavior keeps the
    // timeline visually contiguous.
    expect(ww1?.startTime).toBe("00:00");
    expect(ww1?.endTime).toBe("09:10");
  });

  it("stretches the wake window when the actual nap starts later than projected", () => {
    // Daycare-late-nap scenario: WW2 was projected to end at 11:25; actual
    // Nap 2 didn't start until 13:30. WW2 should stretch to 13:30 so the
    // timeline doesn't show a confusing gap between WW2 end and Nap 2 start.
    const actuals = [actualNap(2, "13:30", "14:30")];
    const result = applyNapActuals(baseProj, actuals, sampleSettings);

    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.endTime).toBe("13:30");

    const nap2 = result.find((e) => e.eventKey === "nap_2");
    expect(nap2).toMatchObject({ startTime: "13:30", endTime: "14:30" });
  });

  it("does NOT shrink the wake window when the actual nap starts earlier than projected", () => {
    // The opposite case — early nap. WW shouldn't be retroactively shortened
    // unless the user explicitly edits it; otherwise we'd hide that the
    // baby went down before they were "due."
    const actuals = [actualNap(2, "11:00", "12:00")];
    const result = applyNapActuals(baseProj, actuals, sampleSettings);
    const ww2 = result.find((e) => e.eventKey === "wake_window_2");
    // Original projected WW2 end stays.
    expect(ww2?.endTime).not.toBe("11:00");
  });
});
