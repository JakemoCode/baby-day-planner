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
});
