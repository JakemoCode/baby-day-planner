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
import type { Settings } from "../schemas";
import { withV3SettingsDefaults } from "./settingsDefaults";

describe("withV3SettingsDefaults", () => {
  it("returns a fully-shaped Settings even from an empty input", () => {
    const out = withV3SettingsDefaults({ childId: "child-1" })!;
    expect(out.bottleChain).toEqual({ bottlesPerDay: 5, bufferAfterWakeMinutes: 10 });
    // The defaulter populates `displayName` with an empty string so the
    // Settings form has something to bind to. Anything else (undefined,
    // a leaked default name) is a real regression.
    expect(out.owners.parent1.displayName).toBe("");
    // Weekday flags default to false so daycare doesn't auto-apply
    // without explicit opt-in. Asserting the value, not its presence —
    // `false` is "defined" so the old `toBeDefined()` passed trivially.
    expect(out.daycare.weekdays.mon).toBe(false);
    // Default chain has six entries; the exact shape is the contract.
    expect(out.wakeWindowsMinutes).toEqual([120, 150, 180, 180, 180, 180]);
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
    // Daycare defaulter populates the full nested shape: disabled, with
    // all weekday flags false and empty ownerId.
    expect(out.daycare.enabled).toBe(false);
    expect(out.daycare.ownerId).toBe("");
    expect(out.daycare.weekdays).toEqual({
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    });
    expect(out.bottleChain).toEqual({ bottlesPerDay: 5, bufferAfterWakeMinutes: 10 });
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

  describe("V2 bottle interval rule migration", () => {
    it("V2-shaped bottleRules move into bottleIntervalRules; bottleRules cleared", () => {
      const v2Doc = {
        childId: "c1",
        bottleRules: [
          { minOz: 0, maxOz: 5.5, intervalMinutes: 150 },
          { minOz: 5.6, intervalMinutes: 180 },
        ],
      } as unknown as Partial<Settings>;
      const out = withV3SettingsDefaults(v2Doc)!;
      expect(out.bottleIntervalRules).toEqual([
        { minOz: 0, maxOz: 5.5, intervalMinutes: 150 },
        { minOz: 5.6, intervalMinutes: 180 },
      ]);
      expect(out.bottleRules).toEqual([]);
    });

    it("already-migrated docs (bottleIntervalRules populated) are left alone", () => {
      const v3Doc: Partial<Settings> = {
        childId: "c1",
        bottleRules: [],
        bottleIntervalRules: [{ minOz: 0, intervalMinutes: 120 }],
      };
      const out = withV3SettingsDefaults(v3Doc)!;
      expect(out.bottleIntervalRules).toEqual([{ minOz: 0, intervalMinutes: 120 }]);
      expect(out.bottleRules).toEqual([]);
    });

    it("V3-shape bottleRules (age-based {minWeeks, amountOz}) are NOT migrated", () => {
      const v3Doc = {
        childId: "c1",
        bottleRules: [{ minWeeks: 0, amountOz: 5 }],
      } as unknown as Partial<Settings>;
      const out = withV3SettingsDefaults(v3Doc)!;
      expect(out.bottleIntervalRules).toEqual([]);
      expect(out.bottleRules).toEqual([{ minWeeks: 0, amountOz: 5 }]);
    });

    it("empty bottleRules does not produce false-positive migration", () => {
      const out = withV3SettingsDefaults({
        childId: "c1",
        bottleRules: [],
      })!;
      expect(out.bottleIntervalRules).toEqual([]);
    });
  });
});
