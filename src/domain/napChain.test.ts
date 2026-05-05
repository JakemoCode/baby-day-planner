import { describe, it, expect } from "vitest";
import { projectNapChain } from "./napChain";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";

describe("projectNapChain", () => {
  it("returns empty when wakeTime is undefined", () => {
    const { wakeTime: _wt, ...dayWithoutWake } = sampleDay;
    expect(projectNapChain(dayWithoutWake, sampleSettings)).toEqual([]);
  });

  it("emits wake event at wakeTime", () => {
    const events = projectNapChain(sampleDay, sampleSettings);
    expect(events[0]).toMatchObject({ type: "wake", startTime: "07:00", source: "projected" });
  });

  it("alternates wake_window then nap blocks based on wakeWindowsMinutes", () => {
    const events = projectNapChain(sampleDay, sampleSettings);
    const types = events.map((e) => `${e.type}:${e.startTime}-${e.endTime ?? ""}`);
    expect(types).toEqual([
      "wake:07:00-",
      "wake_window:07:00-09:00",
      "nap:09:00-10:00",
      "wake_window:10:00-12:15",
      "nap:12:15-13:15",
      "wake_window:13:15-15:30",
      "nap:15:30-16:30",
      "wake_window:16:30-19:00",
      "nap:19:00-20:00",
    ]);
  });

  it("labels naps Nap 1, Nap 2, ...", () => {
    const events = projectNapChain(sampleDay, sampleSettings);
    const napLabels = events.filter((e) => e.type === "nap").map((e) => e.label);
    expect(napLabels).toEqual(["Nap 1", "Nap 2", "Nap 3", "Nap 4"]);
  });

  it("labels wake windows Wake Window 1, 2, ...", () => {
    const events = projectNapChain(sampleDay, sampleSettings);
    const wwLabels = events.filter((e) => e.type === "wake_window").map((e) => e.label);
    expect(wwLabels).toEqual(["Wake Window 1", "Wake Window 2", "Wake Window 3", "Wake Window 4"]);
  });
});
