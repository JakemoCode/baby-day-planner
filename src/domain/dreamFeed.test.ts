import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { addDreamFeed } from "./dreamFeed";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";

const bedtime = (start: string): Event => ({
  id: "bt",
  dayId: sampleDay.id,
  eventKey: "bedtime",
  type: "bedtime",
  label: "Bedtime",
  startTime: start,
  source: "projected",
  status: "projected",
});

describe("addDreamFeed", () => {
  it("emits dream feed at earliest configured time when ≥ bedtime + min interval", () => {
    const events = [bedtime("19:00")];
    const result = addDreamFeed(events, sampleSettings, sampleDay);
    const df = result.find((e) => e.type === "dream_feed");
    expect(df).toMatchObject({ startTime: "20:30", source: "projected", label: "Dream Feed" });
  });

  it("pushes dream feed later when min interval forces it past earliest", () => {
    const result = addDreamFeed([bedtime("19:30")], sampleSettings, sampleDay);
    expect(result.find((e) => e.type === "dream_feed")?.startTime).toBe("21:00");
  });

  it("caps dream feed at latestTime", () => {
    const result = addDreamFeed([bedtime("19:45")], sampleSettings, sampleDay);
    expect(result.find((e) => e.type === "dream_feed")?.startTime).toBe("21:00");
  });

  it("emits no dream feed when disabled", () => {
    const settings = { ...sampleSettings, dreamFeed: { ...sampleSettings.dreamFeed, enabled: false } };
    const result = addDreamFeed([bedtime("19:00")], settings, sampleDay);
    expect(result.find((e) => e.type === "dream_feed")).toBeUndefined();
  });

  it("emits no dream feed when no bedtime is present", () => {
    const result = addDreamFeed([], sampleSettings, sampleDay);
    expect(result.find((e) => e.type === "dream_feed")).toBeUndefined();
  });
});
