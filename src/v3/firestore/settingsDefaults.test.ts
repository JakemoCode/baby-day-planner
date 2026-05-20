/**
 * V3 Settings defensive defaults — apply V3 defaults to a partial
 * settings doc so the engine never sees an undefined `bottleChain`, etc.
 */

import { describe, expect, it } from "vitest";
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
    expect(out.wakeWindowsMinutes).toEqual([95, 100, 110, 120, 120, 120]);
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
});
