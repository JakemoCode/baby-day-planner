import { describe, it, expect } from "vitest";
import type { Event } from "./types";
import { resolveBottleNapOverlap } from "./bottleOverlap";
import { sampleSettings, sampleDay } from "./__fixtures__/sample";
import { parseTime } from "./time";

const nap = (n: number, start: string, end: string): Event => ({
  id: `nap-${n}`,
  dayId: sampleDay.id,
  eventKey: `nap_${n}`,
  type: "nap",
  kind: "block",
  recorded: false,
  label: `Nap ${n}`,
  startTime: start,
  endTime: end,
  source: "projected",
  status: "projected",
});

const projBottle = (n: number, start: string): Event => ({
  id: `pb-${n}`,
  dayId: sampleDay.id,
  eventKey: `bottle_${n}`,
  type: "bottle",
  kind: "instant",
  recorded: false,
  label: `Bottle ${n}`,
  startTime: start,
  amountOz: 5,
  source: "projected",
  status: "projected",
});

const actualBottle = (n: number, start: string): Event => ({
  ...projBottle(n, start),
  source: "actual",
  status: "actual",
});

describe("resolveBottleNapOverlap", () => {
  it("moves bottle to closer boundary (later) when projected time is past nap midpoint", () => {
    const events = [nap(1, "12:05", "12:50"), projBottle(2, "12:40")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    const b = result.find((e) => e.eventKey === "bottle_2");
    expect(b?.startTime).toBe("12:50");
  });

  it("moves bottle to earlier boundary when closer to nap start", () => {
    const events = [nap(1, "12:05", "12:50"), projBottle(2, "12:10")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("12:05");
  });

  it("falls back to later boundary if earlier would be before now", () => {
    const now = parseTime("12:08");
    const events = [nap(1, "12:05", "12:50"), projBottle(2, "12:10")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, now);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("12:50");
  });

  it("re-anchors subsequent projected bottles using the moved bottle's time", () => {
    const events = [nap(1, "12:05", "12:50"), projBottle(2, "12:40"), projBottle(3, "15:10")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    expect(result.find((e) => e.eventKey === "bottle_3")?.startTime).toBe("15:20");
  });

  it("does not move actual bottles", () => {
    const events = [nap(1, "12:05", "12:50"), actualBottle(2, "12:30")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("12:30");
  });

  it("leaves bottles entirely outside any nap untouched", () => {
    const events = [nap(1, "12:05", "12:50"), projBottle(2, "11:00")];
    const result = resolveBottleNapOverlap(events, sampleSettings, sampleDay, 0);
    expect(result.find((e) => e.eventKey === "bottle_2")?.startTime).toBe("11:00");
  });
});
