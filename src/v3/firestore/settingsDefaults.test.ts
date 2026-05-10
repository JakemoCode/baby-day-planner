/**
 * V3 Settings defensive defaults — bridge partial Firestore docs (or
 * V2-shape docs left over from before the cutover) into a fully-shaped
 * V3 Settings so the engine doesn't crash on `undefined.bottleChain`.
 *
 * This is a transitional safety net. Once the Settings page is cutover
 * to V3 and writes complete docs, partial docs stop happening; this
 * helper either gets removed or stays as cheap insurance.
 */

import { describe, expect, it } from "vitest";
import { withV3SettingsDefaults } from "./settingsDefaults";

describe("withV3SettingsDefaults", () => {
  it("returns a fully-shaped Settings even from an empty input", () => {
    const out = withV3SettingsDefaults({ childId: "child-1" })!;
    expect(out.bottleChain).toEqual({ bottlesPerDay: 5, bufferAfterWakeMinutes: 10 });
    expect(out.owners.parent1.displayName).toBeDefined();
    expect(out.daycare.weekdays.mon).toBeDefined();
    expect(out.wakeWindowsMinutes).toBeInstanceOf(Array);
  });

  it("preserves caller-supplied values over defaults", () => {
    const out = withV3SettingsDefaults({
      childId: "child-1",
      bottleChain: { bottlesPerDay: 7, bufferAfterWakeMinutes: 20 },
      owners: {
        parent1: { displayName: "Jake", color: "#0af" },
        parent2: { displayName: "Sam", color: "#f0a" },
        other: [],
      },
    })!;
    expect(out.bottleChain.bottlesPerDay).toBe(7);
    expect(out.owners.parent1.displayName).toBe("Jake");
  });

  it("fills in nested defaults when only top-level keys are present", () => {
    const out = withV3SettingsDefaults({
      childId: "child-1",
      owners: {
        parent1: { displayName: "Jake", color: "#0af" },
        parent2: { displayName: "Sam", color: "#f0a" },
        other: [],
      },
    })!;
    expect(out.daycare).toBeDefined();
    expect(out.daycare.enabled).toBe(false);
    expect(out.bottleChain).toBeDefined();
  });

  it("returns null when the input itself is null (lets the hook stay loading)", () => {
    expect(withV3SettingsDefaults(null)).toBeNull();
  });

  // PR-A0.12: V2 string time fields → TimeMin coercion. The realistic
  // fixture exposed that without these, the engine emits NaN-keyed pump
  // events. Coercion is a transitional safety net — see TODO(PR-C1) in
  // the implementation.
  describe("V2 string time field coercion", () => {
    it("coerces pumpTimes string entries to TimeMin", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        pumpTimes: ["10:30", "14:30"] as unknown as number[],
      })!;
      expect(out.pumpTimes).toEqual([10 * 60 + 30, 14 * 60 + 30]);
    });

    it("preserves numeric pumpTimes entries unchanged", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        pumpTimes: [630, 870],
      })!;
      expect(out.pumpTimes).toEqual([630, 870]);
    });

    it("coerces pumpTimes mixed string/number entries", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        pumpTimes: ["10:30", 870] as unknown as number[],
      })!;
      expect(out.pumpTimes).toEqual([630, 870]);
    });

    it("coerces bedtimeThreshold string to TimeMin", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        bedtimeThreshold: "19:00" as unknown as number,
      })!;
      expect(out.bedtimeThreshold).toBe(19 * 60);
    });

    it("coerces defaultWakeTime string to TimeMin", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        defaultWakeTime: "07:30" as unknown as number,
      })!;
      expect(out.defaultWakeTime).toBe(7 * 60 + 30);
    });

    it("coerces dreamFeedStart string to TimeMin", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        dreamFeedStart: "22:00" as unknown as number,
      })!;
      expect(out.dreamFeedStart).toBe(22 * 60);
    });

    it("coerces dreamFeedEnd string to TimeMin", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        dreamFeedEnd: "23:30" as unknown as number,
      })!;
      expect(out.dreamFeedEnd).toBe(23 * 60 + 30);
    });

    it("coerces dailyRecurring[].time string to TimeMin", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        dailyRecurring: [
          {
            id: "cook-dinner",
            label: "Cook Dinner",
            time: "17:00" as unknown as number,
            enabled: true,
          },
        ],
      })!;
      expect(out.dailyRecurring[0]!.time).toBe(17 * 60);
    });

    it("malformed time string falls back to 0 rather than NaN", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        pumpTimes: ["not-a-time"] as unknown as number[],
        bedtimeThreshold: "garbage" as unknown as number,
      })!;
      expect(out.pumpTimes).toEqual([0]);
      expect(out.bedtimeThreshold).toBe(0);
      expect(Number.isFinite(out.bedtimeThreshold)).toBe(true);
    });
  });
});
