import { describe, it, expect } from "vitest";
import { applyBedtime } from "./bedtime";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";
import { projectNapChain } from "./napChain";

describe("applyBedtime", () => {
  it("replaces last projected nap with a bedtime point event when its start ≥ threshold", () => {
    const proj = projectNapChain(sampleDay, sampleSettings);
    const result = applyBedtime(proj, sampleSettings);

    const nap4 = result.find((e) => e.eventKey === "nap_4");
    expect(nap4).toBeUndefined();

    const bedtime = result.find((e) => e.type === "bedtime");
    expect(bedtime).toMatchObject({
      type: "bedtime",
      label: "Bedtime",
      startTime: "19:00",
      source: "projected",
    });
    expect(bedtime?.endTime).toBeUndefined();
  });

  it("does not affect naps before threshold", () => {
    const proj = projectNapChain(sampleDay, sampleSettings);
    const result = applyBedtime(proj, sampleSettings);
    expect(result.find((e) => e.eventKey === "nap_1")).toBeDefined();
    expect(result.find((e) => e.eventKey === "nap_2")).toBeDefined();
    expect(result.find((e) => e.eventKey === "nap_3")).toBeDefined();
  });

  it("leaves wake window before bedtime intact", () => {
    const proj = projectNapChain(sampleDay, sampleSettings);
    const result = applyBedtime(proj, sampleSettings);
    const ww4 = result.find((e) => e.eventKey === "wake_window_4");
    expect(ww4).toMatchObject({ startTime: "16:30", endTime: "19:00" });
  });

  it("emits no bedtime if all naps fit before threshold", () => {
    const earlyBedtime = { ...sampleSettings, bedtimeThreshold: "23:00" };
    const proj = projectNapChain(sampleDay, earlyBedtime);
    const result = applyBedtime(proj, earlyBedtime);
    expect(result.find((e) => e.type === "bedtime")).toBeUndefined();
  });

  it("removes wake_window events that start at or after the bedtime nap's start time", () => {
    // Set threshold early enough that nap_3 becomes bedtime (nap_3 starts at 15:30)
    // nap_3 napToReplace.startTime = "15:30"; WW4 starts at cursor after nap_3 = 16:30
    // 16:30 >= 15:30 → WW4 should be removed
    const earlyThreshold = { ...sampleSettings, bedtimeThreshold: "15:00" };
    const proj = projectNapChain(sampleDay, earlyThreshold);
    const result = applyBedtime(proj, earlyThreshold);

    // WW4 starts after napToReplace (nap_3 at 15:30), so it must be removed
    expect(result.find((e) => e.eventKey === "wake_window_4")).toBeUndefined();
    // WW3 starts at 13:15, before 15:30, so it should remain
    expect(result.find((e) => e.eventKey === "wake_window_3")).toBeDefined();
    // bedtime should be at nap_3's start
    const bedtime = result.find((e) => e.type === "bedtime");
    expect(bedtime?.startTime).toBe("15:30");
  });
});
