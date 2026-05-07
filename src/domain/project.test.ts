import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { projectDay } from "./project";
import { sampleSettings, sampleDay, saturdayTemplate } from "./__fixtures__/sample";

const bottle = (n: number, start: string, oz: number): Event => ({
  id: `actual-bottle-${n}`,
  dayId: sampleDay.id,
  eventKey: `bottle_${n}`,
  type: "bottle",
  kind: "instant",
  recorded: false,
  label: `Bottle ${n}`,
  startTime: start,
  amountOz: oz,
  source: "actual",
  status: "actual",
});

describe("projectDay (integration)", () => {
  it("returns wake + 4 wake_windows + 3 naps + 1 bedtime + putdowns + dream feed + pumps", () => {
    const out = projectDay({ day: sampleDay, settings: sampleSettings, actuals: [] });
    const counts = out.reduce<Record<string, number>>((m, e) => {
      m[e.type] = (m[e.type] ?? 0) + 1;
      return m;
    }, {});
    expect(counts.wake).toBe(1);
    expect(counts.wake_window).toBe(4);
    expect(counts.nap).toBe(3);
    expect(counts.bedtime).toBe(1);
    expect(counts.putdown).toBe(4); // 3 naps + 1 bedtime
    expect(counts.dream_feed).toBe(1);
    expect(counts.pump).toBe(2);
  });

  it("includes Bottle 1 actual and projects the chain forward", () => {
    const out = projectDay({
      day: sampleDay,
      settings: sampleSettings,
      actuals: [bottle(1, "07:05", 5)],
    });
    expect(out.find((e) => e.eventKey === "bottle_1")?.source).toBe("actual");
    expect(out.find((e) => e.eventKey === "bottle_2")?.source).toBe("projected");
  });

  it("applies a template to nap owners", () => {
    const out = projectDay({
      day: sampleDay,
      settings: sampleSettings,
      actuals: [],
      template: saturdayTemplate,
    });
    expect(out.find((e) => e.eventKey === "nap_1")?.owner).toBe("Kelly");
  });

  it("returns sorted by startTime", () => {
    const out = projectDay({ day: sampleDay, settings: sampleSettings, actuals: [] });
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.startTime >= out[i - 1]!.startTime).toBe(true);
    }
  });

  it("handles overlap: bottle projected during a nap moves to nearest boundary", () => {
    const out = projectDay({
      day: sampleDay,
      settings: sampleSettings,
      actuals: [bottle(1, "06:30", 4)],
    });
    const b2 = out.find((e) => e.eventKey === "bottle_2");
    expect(b2?.startTime).toBe("09:00");
  });
});
