/**
 * Realistic data smoke tests.
 *
 * Runs the V3 engine + defaulters + back-compat shims against the
 * fixtures that mirror real Firestore states during the cutover.
 * Catches defaulter blind spots BEFORE production.
 *
 * Failures here are P0 — the cutover plan assumes all of these pass.
 */

import { describe, expect, it } from "vitest";
import { withV3SettingsDefaults } from "../firestore/settingsDefaults";
import { withV3EventDefaults } from "../firestore/eventDefaults";
import { withV2SettingsBackcompat, withV2EventBackcompat } from "../firestore/v2Backcompat";
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

  it("a V2 settings doc gets V3 defaults backfilled (does NOT crash engine)", () => {
    // V2 doc lacks bottleChain, owners, daycare, dailyRecurring, dreamFeed* (flat)
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

  it("a mixed V2/V3 doc preserves V3 fields and fills missing", () => {
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

  it("a V2 bottle event converts correctly: string time → TimeMin, recorded triplet → completed lifecycle, free-string owner → parent1 fallback", () => {
    const out = withV3EventDefaults(fixtures.events.v2Bottle as Event);
    expect(out.startTime).toBe(7 * 60 + 30);
    expect(out.lifecycle).toEqual({ state: "completed", committedAt: 7 * 60 + 30 });
    expect(out.owner).toEqual({ slot: "parent1" }); // current heuristic — PR-A0.6 will improve with owners config
    expect(out.kind).toBe("instant");
    expect(out.hasPutdown).toBe(false);
  });

  it("a V2 in-progress nap (recorded=true, no endTime) maps to lifecycle.started", () => {
    const out = withV3EventDefaults(fixtures.events.v2NapInProgress as Event);
    expect(out.lifecycle).toEqual({ state: "started", committedAt: 9 * 60 });
    expect(out.endTime).toBeUndefined();
    expect(out.kind).toBe("block");
  });

  it("a V2 overridden event maps to lifecycle.overridden", () => {
    const out = withV3EventDefaults(fixtures.events.v2Overridden as Event);
    expect(out.lifecycle).toEqual({ state: "overridden", annotatedAt: 13 * 60 });
    expect(out.endTime).toBe(14 * 60 + 30);
  });

  it("a V2 event with no owner stays without owner (no parent1 fallback)", () => {
    const out = withV3EventDefaults(fixtures.events.v2NoOwner as Event);
    expect(out.owner).toBeUndefined();
  });

  it("a partial V3 event (missing hasPutdown + lifecycle) gets defaults filled", () => {
    const out = withV3EventDefaults(fixtures.events.partialV3 as Event);
    expect(out.hasPutdown).toBe(false);
    expect(out.lifecycle).toEqual({ state: "projected" });
  });
});

// ---------------------------------------------------------------------------
// V2 ← V3 back-compat shim (used by V2 hooks during Phase B transition)
// ---------------------------------------------------------------------------

describe("withV2SettingsBackcompat — V3 docs read by V2 surfaces", () => {
  it("V3 settings doc converts back to V2 shape (bedtimeThreshold becomes string)", () => {
    const out = withV2SettingsBackcompat(fixtures.settings.v3);
    expect(out).not.toBeNull();
    expect(out!.bedtimeThreshold).toBe("19:00");
    expect(out!.pumpTimes).toEqual(["10:30", "14:30"]);
  });

  it("V3 settings doc with V3 dailyRecurring synthesizes V2 cookDinner", () => {
    const out = withV2SettingsBackcompat(fixtures.settings.v3);
    expect(out!.cookDinner).toEqual({ enabled: true, time: "17:00" });
  });

  it("V3 settings doc with V3 flat dream feed synthesizes V2 nested object", () => {
    const out = withV2SettingsBackcompat(fixtures.settings.v3);
    expect(out!.dreamFeed.enabled).toBe(true);
    expect(out!.dreamFeed.earliestTime).toBe("20:30");
  });
});

describe("withV2EventBackcompat — V3 events read by V2 surfaces", () => {
  it("V3 event converts back to V2 shape (TimeMin → HH:MM, lifecycle → triplet)", () => {
    const out = withV2EventBackcompat(fixtures.events.v3Bottle);
    expect(out.startTime).toBe("07:30");
    expect(out.source).toBe("actual");
    expect(out.status).toBe("completed");
    expect(out.recorded).toBe(true);
  });

  it("V3 started nap with no endTime maps to V2 (no endTime, source=actual, status=actual)", () => {
    const out = withV2EventBackcompat(fixtures.events.v3NapStarted);
    expect(out.startTime).toBe("09:00");
    expect(out.endTime).toBeUndefined();
    expect(out.source).toBe("actual");
    expect(out.status).toBe("actual");
    expect(out.recorded).toBe(true);
  });

  it("V3 overridden event maps to V2 (source=manual, status=overridden, recorded=false)", () => {
    const out = withV2EventBackcompat(fixtures.events.v3Overridden);
    expect(out.source).toBe("manual");
    expect(out.status).toBe("overridden");
    expect(out.recorded).toBe(false);
  });

  it("V3 OwnerRef gets dropped if no owners config supplied (cosmetic loss only)", () => {
    const out = withV2EventBackcompat(fixtures.events.v3Bottle);
    // owners not passed — slot ref can't resolve to V2 string
    expect(out.owner).toBeUndefined();
  });

  it("V3 OwnerRef resolves to V2 string when owners config supplied", () => {
    const out = withV2EventBackcompat(fixtures.events.v3Bottle, {
      parent1: { displayName: "Jake", color: "#0af" },
      parent2: { displayName: "Sam", color: "#f0a" },
      other: [],
    });
    expect(out.owner).toBe("Jake");
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

  it("V2-shape settings (after defaulter) + V2 day + V2 actuals → engine produces all-finite startTimes (PR-A0.12: pumpTimes string→TimeMin coerced)", () => {
    const settings = withV3SettingsDefaults(fixtures.settings.v2 as Partial<Settings>)!;
    const day: Day = {
      ...(fixtures.days.v2 as unknown as Day),
      wakeTime: 7 * 60 + 30,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
    };
    const actuals = [
      fixtures.events.v2Bottle,
      fixtures.events.v2NapInProgress,
      fixtures.events.v2Overridden,
    ].map((e) => withV3EventDefaults(e as Event));
    const result = projectDay({ day, settings, actuals, nowMinutes: 10 * 60 });
    expect(result.every((e) => Number.isFinite(e.startTime))).toBe(true);
  });

  it("V2-shape settings + actuals → engine does not throw and preserves recorded events", () => {
    // Same input as the .fails() test above, but only asserts the
    // engine doesn't throw. Catches future regressions where V2-shape
    // input would crash the engine entirely.
    const settings = withV3SettingsDefaults(fixtures.settings.v2 as Partial<Settings>)!;
    const day: Day = {
      ...(fixtures.days.v2 as unknown as Day),
      wakeTime: 7 * 60 + 30,
      suppressedRecurringIds: [],
      suppressedDaycareDay: false,
    };
    const actuals = [
      fixtures.events.v2Bottle,
      fixtures.events.v2NapInProgress,
      fixtures.events.v2Overridden,
    ].map((e) => withV3EventDefaults(e as Event));
    const result = projectDay({ day, settings, actuals, nowMinutes: 10 * 60 });
    expect(result.length).toBeGreaterThan(0);
    // Reality-wins: recorded events preserved
    const bottle1 = result.find((e) => e.eventKey === "bottle_1");
    expect(bottle1).toBeDefined();
    expect(bottle1!.lifecycle.state).toBe("completed");
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
