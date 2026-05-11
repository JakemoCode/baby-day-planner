/**
 * Realistic data smoke tests.
 *
 * Runs the V3 engine + defaulters against fixtures mirroring real
 * Firestore states (clean V3, partial V3, partial-of-any-shape).
 * Catches defaulter blind spots BEFORE production. Failures here are P0.
 */

import { describe, expect, it } from "vitest";
import { withV3SettingsDefaults } from "../firestore/settingsDefaults";
import { withV3EventDefaults } from "../firestore/eventDefaults";
import { projectDay } from "../engine/projectDay";
import type { Day, Event, Settings } from "../schemas";
import { fixtures } from "./fixtures/realistic";

// ---------------------------------------------------------------------------
// withV3SettingsDefaults — must produce engine-safe Settings from any input
// ---------------------------------------------------------------------------

describe("withV3SettingsDefaults — realistic data", () => {
  it("a clean V3 settings doc round-trips with no field loss", () => {
    const out = withV3SettingsDefaults(fixtures.settings.v3 as Partial<Settings>);
    expect(out).not.toBeNull();
    expect(out!.bottleChain.bottlesPerDay).toBe(5);
    expect(out!.owners.parent1.displayName).toBe("Jake");
    expect(out!.daycare.weekdays.mon).toBe(false);
  });

  it("a partial settings doc gets V3 defaults backfilled (does NOT crash engine)", () => {
    // Doc lacks bottleChain, owners, daycare, dailyRecurring, dreamFeed*.
    const out = withV3SettingsDefaults(fixtures.settings.v2 as Partial<Settings>);
    expect(out).not.toBeNull();
    expect(out!.bottleChain).toBeDefined();
    expect(out!.bottleChain.bottlesPerDay).toBe(5);
    expect(out!.owners.parent1).toBeDefined();
    expect(out!.daycare.weekdays).toBeDefined();
  });

  it("a partial V3 doc (missing critical fields) gets defaults filled", () => {
    const out = withV3SettingsDefaults(fixtures.settings.partialV3 as Partial<Settings>);
    expect(out).not.toBeNull();
    expect(out!.bottleChain).toBeDefined();
    expect(out!.owners).toBeDefined();
    expect(out!.daycare).toBeDefined();
  });

  it("a partially-filled doc preserves explicit fields and fills missing", () => {
    const out = withV3SettingsDefaults(fixtures.settings.mixed as Partial<Settings>);
    expect(out).not.toBeNull();
    expect(out!.bedtimeThreshold).toBe(19 * 60); // V3 wrote, preserved
    expect(out!.bottleChain.bottlesPerDay).toBe(5);
  });

  it("returns null for null input (lets the hook stay loading)", () => {
    expect(withV3SettingsDefaults(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// withV3EventDefaults — must produce engine-safe events from V2/V3/partial
// ---------------------------------------------------------------------------

describe("withV3EventDefaults — realistic data", () => {
  it("a V3 event passes through unchanged", () => {
    const out = withV3EventDefaults(fixtures.events.v3Bottle as Event);
    expect(out.startTime).toBe(7 * 60 + 30);
    expect(out.lifecycle).toEqual({ state: "completed", committedAt: 7 * 60 + 30 });
    expect(out.owner).toEqual({ slot: "parent1" });
  });

  it("a partial V3 event (missing hasPutdown + lifecycle) gets defaults filled", () => {
    const out = withV3EventDefaults(fixtures.events.partialV3 as Event);
    expect(out.hasPutdown).toBe(false);
    expect(out.lifecycle).toEqual({ state: "projected" });
  });
});

// ---------------------------------------------------------------------------
// End-to-end: engine consumes realistic settings + day + actuals
// ---------------------------------------------------------------------------

describe("engine end-to-end with realistic fixtures", () => {
  it("V3 settings + V3 day + V3 actuals → engine produces sorted Event[] without crash", () => {
    const settings = withV3SettingsDefaults(fixtures.settings.v3 as Partial<Settings>)!;
    const day = fixtures.days.v3 as Day;
    const actuals = [withV3EventDefaults(fixtures.events.v3Bottle as Event)];
    const result = projectDay({ day, settings, actuals, nowMinutes: 10 * 60 });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((e) => typeof e.startTime === "number")).toBe(true);
    expect(result.every((e) => Number.isFinite(e.startTime))).toBe(true);
  });

  it("partial V3 settings (missing bottleChain etc.) + defaults → engine works", () => {
    const settings = withV3SettingsDefaults(fixtures.settings.partialV3 as Partial<Settings>)!;
    const day = fixtures.days.v3 as Day;
    const result = projectDay({ day, settings, actuals: [], nowMinutes: 10 * 60 });
    expect(result.length).toBeGreaterThan(0);
  });

  it("overridden actual at nap_2 suppresses projected nap_2 duplicate (R0 reality-wins)", () => {
    const settings = withV3SettingsDefaults(fixtures.settings.v3 as Partial<Settings>)!;
    const day = fixtures.days.v3 as Day;
    const overriddenNap2 = withV3EventDefaults(fixtures.events.v3Overridden as Event);
    const result = projectDay({
      day,
      settings,
      actuals: [overriddenNap2],
      nowMinutes: 10 * 60,
    });
    const nap2Events = result.filter((e) => e.eventKey === "nap_2");
    expect(nap2Events).toHaveLength(1);
    expect(nap2Events[0]!.lifecycle.state).toBe("overridden");
  });
});
