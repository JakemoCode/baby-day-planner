/**
 * R7.x — Bedtime rules.
 *
 * Tests-first per CLAUDE.md TDD protocol.
 */

import { describe, expect, it } from "vitest";
import {
  aContext,
  aDay,
  aProjectedBedtime,
  aRecordedBedtime,
  aRecordedNap,
  aSettings,
} from "../../__tests__/factories";
import { projectDay } from "../projectDay";
import type { Rule } from "../evaluator";
import { RULES as NAP_RULES } from "./naps";
import { RULES as BEDTIME_RULES } from "./bedtime";

const ALL: Rule[] = [...NAP_RULES, ...BEDTIME_RULES];

describe("R7.6 — bedtimeThreshold triggers bedtime substitution in the cascade", () => {
  it("the first projected nap whose start ≥ threshold is replaced by bedtime", () => {
    // Cascade: WW [120, 135, 135, 150], napLen 60, wake 7:00 →
    //   nap_4 would start at 19:00 (= threshold). It becomes bedtime.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    // No nap_4 in output (replaced by bedtime).
    expect(out.find((e) => e.eventKey === "nap_4")).toBeUndefined();

    // Bedtime exists at the threshold.
    const bedtime = out.find((e) => e.eventKey === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.type).toBe("bedtime");
    expect(bedtime!.kind).toBe("block");
    expect(bedtime!.startTime).toBe(19 * 60);
    expect(bedtime!.lifecycle.state).toBe("projected");
  });
});

describe("R7.1 — bedtime endTime defaults to settings.defaultWakeTime next day", () => {
  it("threshold-substituted bedtime ends at defaultWakeTime + 24h", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    // 7:00 next day = 7*60 + 24*60 = 31*60 = 1860 minutes from today's
    // midnight. Cross-day notation handles this transparently.
    expect(bedtime!.endTime).toBe(7 * 60 + 24 * 60);
  });
});

describe("R7.4 — projected naps starting at/after bedtime are not projected", () => {
  it("with naps that would project past bedtime, only nap_4 (now bedtime) and earlier naps survive", () => {
    // 5-WW cascade designed so nap_4 lands at the threshold and nap_5
    // would otherwise project at ~22:00. After bedtime substitution, nap_5
    // must not appear — projected naps after a bedtime are dropped.
    //
    // Cascade with WW = [120, 120, 240, 60, 120], napLen 60, wake 7:00:
    //   ww1: 7-9,   nap1: 9-10
    //   ww2: 10-12, nap2: 12-13
    //   ww3: 13-17, nap3: 17-18
    //   ww4: 18-19, nap4: 19-20    ← becomes bedtime (start ≥ 19:00)
    //   ww5: 20-22, nap5: 22-23    ← would-be projected, must be dropped
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 120, 240, 60, 120],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    expect(out.find((e) => e.eventKey === "nap_5")).toBeUndefined();
    // Bedtime in place of nap_4 at 19:00.
    expect(out.find((e) => e.eventKey === "bedtime")?.startTime).toBe(19 * 60);
    // Earlier naps unaffected.
    expect(out.find((e) => e.eventKey === "nap_1")).toBeDefined();
    expect(out.find((e) => e.eventKey === "nap_3")).toBeDefined();
  });
});

describe("R7.5 — projected nap crossing the threshold becomes bedtime", () => {
  it("with a projected nap_4 starting at 18:30 and ending at 19:30 (crosses 19:00 threshold), nap_4 is replaced by bedtime at 18:30", () => {
    // WW [120, 120, 240, 30], napLen 60, wake 7:00 →
    //   ww1: 7-9,    nap1: 9-10
    //   ww2: 10-12,  nap2: 12-13
    //   ww3: 13-17,  nap3: 17-18
    //   ww4: 18-18:30, nap4: 18:30-19:30  ← crosses threshold
    // Expected: nap_4 replaced by bedtime starting at 18:30 (R7.11).
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 120, 240, 30],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    expect(out.find((e) => e.eventKey === "nap_4")).toBeUndefined();
    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBe(18 * 60 + 30);
  });
});

describe("R7.7 — manual bedtime is the user's authoritative declaration", () => {
  it("with a recorded bedtime at 18:00, threshold (19:00) does NOT substitute another bedtime", () => {
    // Same cascade as R7.4 test, but with a manual bedtime at 18:00.
    // Expected: ONE bedtime (the recorded one), and it sits at 18:00 not
    // 19:00. nap_4 and nap_5 (projected past 18:00) get dropped by R7.4.
    const recordedBedtime = aRecordedBedtime({
      id: "actual_bedtime",
      eventKey: "bedtime",
      start: 18 * 60,
      end: 30 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 120, 240, 60, 120],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [recordedBedtime],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    const bedtimes = out.filter((e) => e.type === "bedtime");
    expect(bedtimes).toHaveLength(1);
    expect(bedtimes[0]!.id).toBe(recordedBedtime.id);
    expect(bedtimes[0]!.startTime).toBe(18 * 60);
    expect(bedtimes[0]!.lifecycle.state).toBe("completed");

    // Projected naps after the manual bedtime are dropped (R7.4).
    expect(out.find((e) => e.eventKey === "nap_4")).toBeUndefined();
    expect(out.find((e) => e.eventKey === "nap_5")).toBeUndefined();
  });
});

describe("R7.4b — projected wake_windows after bedtime are dropped", () => {
  it("drops wake_window_N entries that fall at/after the bedtime substitution", () => {
    // 5 wake-windows configured. R3.1 emits all 5 up-front; R7.6 substitutes
    // a nap for bedtime; the new R7.4b rule drops any wake_window that
    // ended up at/after bedtime.startTime so cross-day wake_windows don't
    // visually collide with bedtime's tail on the timeline.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150, 180],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL },
    );

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    const orphanWakeWindows = out.filter(
      (e) => e.type === "wake_window" && e.startTime >= bedtime!.startTime,
    );
    expect(orphanWakeWindows).toHaveLength(0);
  });
});

// Tiny use to avoid lint warning until further bedtime tests reference these.
void aProjectedBedtime;
void aRecordedNap;
