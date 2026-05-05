import { describe, it, expect } from "vitest";
import { intervalForAmount } from "./bottleRules";
import { sampleSettings } from "./__fixtures__/sample";

describe("intervalForAmount", () => {
  const rules = sampleSettings.bottleRules;
  const fallback = sampleSettings.defaultBottleIntervalMinutes;

  it("returns interval for amount within first range (0–5.5oz)", () => {
    expect(intervalForAmount(rules, 4.5, fallback)).toBe(150);
    expect(intervalForAmount(rules, 5.5, fallback)).toBe(150);
  });

  it("returns interval for open-ended range (5.6+oz)", () => {
    expect(intervalForAmount(rules, 6, fallback)).toBe(180);
    expect(intervalForAmount(rules, 8, fallback)).toBe(180);
  });

  it("returns fallback when amount is undefined", () => {
    expect(intervalForAmount(rules, undefined, fallback)).toBe(180);
  });

  it("returns fallback when no rule matches", () => {
    expect(intervalForAmount([{ minOz: 10, intervalMinutes: 240 }], 3, fallback)).toBe(180);
  });

  it("picks the most specific matching rule when multiple apply", () => {
    const overlapping = [
      { minOz: 0, intervalMinutes: 120 },
      { minOz: 4, maxOz: 6, intervalMinutes: 180 },
    ];
    expect(intervalForAmount(overlapping, 5, 999)).toBe(180);
  });
});
