/**
 * V3 Settings defensive defaults — tests for makeDefaultSettings and
 * normalizeSettingsDoc, plus backward-compat tests for withV3SettingsDefaults.
 */

import { describe, expect, it } from "vitest";
import {
  makeDefaultSettings,
  normalizeSettingsDoc,
  withV3SettingsDefaults,
} from "./settingsDefaults";

// ---------------------------------------------------------------------------
// makeDefaultSettings
// ---------------------------------------------------------------------------

describe("makeDefaultSettings", () => {
  it("returns a Settings with the given childId", () => {
    const s = makeDefaultSettings("child-abc");
    expect(s.childId).toBe("child-abc");
  });

  it("returns all required fields structurally valid", () => {
    const s = makeDefaultSettings("child-1");
    expect(s.bottleChain).toEqual({ bottlesPerDay: 5, bufferAfterWakeMinutes: 10 });
    expect(s.owners.parent1.displayName).toBe("");
    expect(s.daycare.weekdays.mon).toBe(false);
    expect(s.wakeWindowsMinutes).toEqual([95, 100, 110, 120, 120, 120]);
    expect(s.pumpTimes).toEqual([]);
    expect(s.dailyRecurring).toEqual([]);
    expect(s.daycare.enabled).toBe(false);
  });

  it("does not fire any legacy migration logic (no heuristic rewrite on clean input)", () => {
    const s = makeDefaultSettings("child-1");
    // timelinePxPerHour should be 120 (the intentional default), never 80
    expect(s.timelinePxPerHour).toBe(120);
    // timelineColorMode is set to a real value, not null
    expect(s.timelineColorMode).toBe("type");
  });
});

// ---------------------------------------------------------------------------
// ADR-0002 bedtime model defaults
// ---------------------------------------------------------------------------

describe("bedtime defaults (ADR-0002)", () => {
  it("bedtimeThreshold default is 17:30 (latest projected nap end)", () => {
    const s = makeDefaultSettings("child-1");
    expect(s.bedtimeThreshold).toBe(17 * 60 + 30);
  });

  it("earliestBedtime default is 18:00 (floor for projected bedtime)", () => {
    const s = makeDefaultSettings("child-1");
    expect(s.earliestBedtime).toBe(18 * 60);
  });

  it("earliestBedtime > bedtimeThreshold (floor strictly after the nap-end cap)", () => {
    const s = makeDefaultSettings("child-1");
    expect(s.earliestBedtime).toBeGreaterThan(s.bedtimeThreshold);
  });

  it("normalizeSettingsDoc default-fills earliestBedtime on legacy docs that lack it", () => {
    const raw = { childId: "child-1" };
    const s = normalizeSettingsDoc(raw);
    expect(s.earliestBedtime).toBe(18 * 60);
  });

  it("normalizeSettingsDoc preserves a caller-supplied earliestBedtime", () => {
    const raw = { childId: "child-1", earliestBedtime: 18 * 60 + 30 };
    const s = normalizeSettingsDoc(raw);
    expect(s.earliestBedtime).toBe(18 * 60 + 30);
  });
});

// ---------------------------------------------------------------------------
// normalizeSettingsDoc
// ---------------------------------------------------------------------------

describe("normalizeSettingsDoc", () => {
  it("promotes pre-#155 pumpTimes: number[] to PumpSession[]", () => {
    const raw = {
      childId: "child-1",
      pumpTimes: [8 * 60, 14 * 60], // legacy number[] format
    };
    const s = normalizeSettingsDoc(raw);
    expect(s.pumpTimes).toEqual([{ time: 480 }, { time: 840 }]);
  });

  it("preserves pumpTimes already in PumpSession[] shape", () => {
    const raw = {
      childId: "child-1",
      pumpTimes: [{ time: 8 * 60, durationMinutes: 25 }],
    };
    const s = normalizeSettingsDoc(raw);
    expect(s.pumpTimes).toEqual([{ time: 480, durationMinutes: 25 }]);
  });

  it("promotes pre-#170 docs missing timelinePxPerHour (gated on timelineColorMode == null)", () => {
    // Legacy doc: timelinePxPerHour = 80, timelineColorMode is absent (null)
    const raw = {
      childId: "child-1",
      timelinePxPerHour: 80,
      // timelineColorMode intentionally absent to simulate legacy doc
    };
    const s = normalizeSettingsDoc(raw);
    // The 80 → 120 migration fires when timelineColorMode is null
    expect(s.timelinePxPerHour).toBe(120);
  });

  it("does NOT migrate timelinePxPerHour=80 when timelineColorMode is already set (deliberate choice)", () => {
    const raw = {
      childId: "child-1",
      timelinePxPerHour: 80,
      timelineColorMode: "owner" as const,
    };
    const s = normalizeSettingsDoc(raw);
    // User explicitly chose 80 with a real colorMode — preserve it
    expect(s.timelinePxPerHour).toBe(80);
  });

  it("fills in missing required fields via DEFAULTS", () => {
    const raw = { childId: "child-1" };
    const s = normalizeSettingsDoc(raw);
    expect(s.bottleChain).toEqual({ bottlesPerDay: 5, bufferAfterWakeMinutes: 10 });
    expect(s.daycare.weekdays).toEqual({
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    });
  });

  it("returns intact a doc already in current shape (idempotent)", () => {
    const raw = {
      childId: "child-1",
      timelinePxPerHour: 120,
      timelineColorMode: "type" as const,
      pumpTimes: [{ time: 8 * 60 }],
      bottleChain: { bottlesPerDay: 7, bufferAfterWakeMinutes: 15 },
    };
    const s = normalizeSettingsDoc(raw);
    expect(s.bottleChain.bottlesPerDay).toBe(7);
    expect(s.timelinePxPerHour).toBe(120);
    expect(s.pumpTimes).toEqual([{ time: 480 }]);
  });

  it("nested arrays not supplied by input are fresh — mutating one doc must not leak into another (symmetry with makeDefaultSettings)", () => {
    // Two independent docs with no overrides for wakeWindowsMinutes /
    // bottleIntervalRules. Mutating one's array must not affect the other.
    const a = normalizeSettingsDoc({ childId: "child-A" });
    const b = normalizeSettingsDoc({ childId: "child-B" });

    a.wakeWindowsMinutes.push(999);
    a.bottleIntervalRules.push({ minOz: 1, maxOz: 2, intervalMinutes: 30 });

    expect(b.wakeWindowsMinutes).not.toContain(999);
    expect(b.bottleIntervalRules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// withV3SettingsDefaults (backward-compat re-export wrapper)
// ---------------------------------------------------------------------------

describe("withV3SettingsDefaults", () => {
  it("returns a fully-shaped Settings even from an empty input", () => {
    const out = withV3SettingsDefaults({ childId: "child-1" })!;
    expect(out.bottleChain).toEqual({ bottlesPerDay: 5, bufferAfterWakeMinutes: 10 });
    // Empty string so the Settings form has something to bind to; undefined
    // or a leaked default name is a real regression.
    expect(out.owners.parent1.displayName).toBe("");
    // false — daycare must not auto-apply without explicit opt-in.
    expect(out.daycare.weekdays.mon).toBe(false);
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
