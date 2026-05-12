/**
 * Tests for `intervalForAmount`. Ported from V2's
 * `src/domain/bottleRules.test.ts` (commit 9ae6d1a). Same semantics:
 * - within-range matches return their rule's interval
 * - open-ended ranges (no maxOz) match anything ≥ minOz
 * - undefined amount returns fallback (no last-bottle info to consult)
 * - no matching rule returns fallback
 * - most-specific (narrowest range) rule wins on overlap
 */

import { describe, it, expect } from "vitest";
import type { BottleIntervalRule } from "../schemas";
import { intervalForAmount } from "./bottleIntervalRules";

const sampleRules: BottleIntervalRule[] = [
  { minOz: 0, maxOz: 5.5, intervalMinutes: 150 },
  { minOz: 5.6, intervalMinutes: 180 },
];
const fallback = 180;

describe("intervalForAmount", () => {
  it("returns interval for amount within first range (0–5.5oz)", () => {
    expect(intervalForAmount(sampleRules, 4.5, fallback)).toBe(150);
    expect(intervalForAmount(sampleRules, 5.5, fallback)).toBe(150);
  });

  it("returns interval for open-ended range (5.6+oz)", () => {
    expect(intervalForAmount(sampleRules, 6, fallback)).toBe(180);
    expect(intervalForAmount(sampleRules, 8, fallback)).toBe(180);
  });

  it("returns fallback when amount is undefined", () => {
    expect(intervalForAmount(sampleRules, undefined, fallback)).toBe(180);
  });

  it("returns fallback when no rule matches", () => {
    expect(intervalForAmount([{ minOz: 10, intervalMinutes: 240 }], 3, fallback)).toBe(180);
  });

  it("picks the most specific matching rule when multiple apply", () => {
    const overlapping: BottleIntervalRule[] = [
      { minOz: 0, intervalMinutes: 120 },
      { minOz: 4, maxOz: 6, intervalMinutes: 180 },
    ];
    expect(intervalForAmount(overlapping, 5, 999)).toBe(180);
  });

  it("returns fallback when rules array is empty", () => {
    expect(intervalForAmount([], 4, fallback)).toBe(180);
  });
});
