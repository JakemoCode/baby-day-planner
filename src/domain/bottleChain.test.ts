import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { projectBottleChain } from "./bottleChain";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";

const bottle = (
  n: number,
  start: string,
  oz: number,
  source: "actual" | "manual" = "actual",
): Event => ({
  id: `actual-bottle-${n}`,
  dayId: sampleDay.id,
  eventKey: `bottle_${n}`,
  type: "bottle",
  label: `Bottle ${n}`,
  startTime: start,
  amountOz: oz,
  source,
  status: source === "actual" ? "actual" : "overridden",
});

describe("projectBottleChain", () => {
  it("returns empty when no Bottle 1 actual exists", () => {
    expect(projectBottleChain([], sampleSettings, sampleDay)).toEqual([]);
  });

  it("projects a 5oz Bottle 1 to next bottle 2:30 later", () => {
    const result = projectBottleChain([bottle(1, "07:05", 5)], sampleSettings, sampleDay);
    const bottle2 = result.find((e) => e.eventKey === "bottle_2");
    expect(bottle2).toMatchObject({
      startTime: "09:35",
      amountOz: 5,
      source: "projected",
      status: "projected",
    });
  });

  it("projects a 6oz Bottle 1 to next bottle 3:00 later", () => {
    const result = projectBottleChain([bottle(1, "07:05", 6)], sampleSettings, sampleDay);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("10:05");
  });

  it("re-anchors chain from a manual edit on Bottle N", () => {
    const actuals = [bottle(1, "07:00", 5), bottle(2, "10:00", 6, "manual")];
    const result = projectBottleChain(actuals, sampleSettings, sampleDay);
    expect(result.find((e) => e.eventKey === "bottle_3")?.startTime).toBe("13:00");
  });

  it("uses defaultBottleAmountOz for projected bottles' amount", () => {
    const result = projectBottleChain([bottle(1, "07:00", 4.5)], sampleSettings, sampleDay);
    const b2 = result.find((e) => e.eventKey === "bottle_2");
    expect(b2?.amountOz).toBe(sampleSettings.defaultBottleAmountOz);
  });

  it("stops projecting when next bottle would land past 23:00", () => {
    const wide = { ...sampleSettings, bottleRules: [{ minOz: 0, intervalMinutes: 60 }] };
    const result = projectBottleChain([bottle(1, "20:00", 5)], wide, sampleDay);
    const lastBottle = result[result.length - 1]!;
    const [hh] = lastBottle.startTime.split(":");
    expect(Number(hh)).toBeLessThan(23);
  });
});
