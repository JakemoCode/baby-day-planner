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
});
