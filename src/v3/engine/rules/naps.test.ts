/**
 * R3.x — Nap rules.
 *
 * Tests-first per CLAUDE.md TDD protocol. Each rule's failing test lands
 * before the implementation; new behavior gets a new failing test before
 * any code change.
 */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aRecordedNap, aSettings } from "../../__tests__/factories";
import { projectDay } from "../projectDay";
import { RULES as NAP_RULES } from "./naps";

describe("R3.1 — projected nap chain from wakeWindowsMinutes", () => {
  it("with [120, 90] WWs, wake at 7:00, projects ww_1, nap_1, ww_2, nap_2", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
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
      { rules: NAP_RULES },
    );

    // Expected cascade:
    //   ww_1 : 7:00 → 9:00   (120 min)
    //   nap_1: 9:00 → 10:00  (60 min)
    //   ww_2 : 10:00 → 11:30 (90 min)
    //   nap_2: 11:30 → 12:30 (60 min)
    const summary = out.map((e) => ({
      eventKey: e.eventKey,
      type: e.type,
      kind: e.kind,
      startTime: e.startTime,
      endTime: e.endTime,
      lifecycle: e.lifecycle.state,
    }));

    expect(summary).toEqual([
      {
        eventKey: "wake_window_1",
        type: "wake_window",
        kind: "block",
        startTime: 7 * 60,
        endTime: 9 * 60,
        lifecycle: "projected",
      },
      {
        eventKey: "nap_1",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        endTime: 10 * 60,
        lifecycle: "projected",
      },
      {
        eventKey: "wake_window_2",
        type: "wake_window",
        kind: "block",
        startTime: 10 * 60,
        endTime: 11 * 60 + 30,
        lifecycle: "projected",
      },
      {
        eventKey: "nap_2",
        type: "nap",
        kind: "block",
        startTime: 11 * 60 + 30,
        endTime: 12 * 60 + 30,
        lifecycle: "projected",
      },
    ]);
  });
});

describe("R3.4 / R3.5 — wake window endTime tracks the next nap's start", () => {
  it("with a recorded nap_2 LATER than projected, ww_2 stretches to the recorded start", () => {
    // Projected cascade (no actuals) would put nap_2 at 11:30.
    // The recorded nap_2 actually started at 13:00 — ww_2 must stretch.
    const recordedNap2 = aRecordedNap({
      id: "actual_nap_2",
      eventKey: "nap_2",
      start: 13 * 60,
      end: 14 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
      }),
      actuals: [recordedNap2],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe(10 * 60);
    expect(ww2?.endTime).toBe(13 * 60);
  });

  it("with a recorded nap_2 EARLIER than projected, ww_2 shrinks to the recorded start", () => {
    // Projected cascade (no actuals) would put nap_2 at 11:30.
    // The baby actually went down at 10:30 — ww_2 must shrink to that.
    const recordedNap2 = aRecordedNap({
      id: "actual_nap_2_early",
      eventKey: "nap_2",
      start: 10 * 60 + 30,
      end: 11 * 60 + 30,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
      }),
      actuals: [recordedNap2],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe(10 * 60);
    expect(ww2?.endTime).toBe(10 * 60 + 30);
  });
});

describe("R3.3 / R3.8 — overridden nap doesn't anchor cascade times", () => {
  it("with an overridden nap_1 at a NON-natural time, cascade computes WW endpoints from defaults", () => {
    // Overridden = "user assigned an owner before the nap happened." Per R3.3,
    // these annotations carry the owner forward but DON'T pin times. The
    // cascade should compute ww_1 / ww_2 endpoints purely from
    // wakeWindowsMinutes, ignoring the overridden's stored startTime / endTime.
    //
    // Settings: WW [120, 90], napLen 60, wake 7:00.
    // Natural cascade:
    //   ww_1 7:00-9:00, nap_1 9:00-10:00, ww_2 10:00-11:30, nap_2 11:30-12:30.
    // The overridden nap_1 sits at 9:30-9:50 (NOT at the natural 9:00-10:00).
    // Despite that, ww_1 must still end at 9:00 and ww_2 must still start
    // at 10:00.
    const overriddenNap1 = aRecordedNap({
      id: "annotated_nap_1",
      eventKey: "nap_1",
      start: 9 * 60 + 30,
      end: 9 * 60 + 50,
      lifecycle: { state: "overridden", annotatedAt: 8 * 60 },
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
        shortNapThresholdMinutes: 35,
        shortNapAdjustmentMinutes: 10,
      }),
      actuals: [overriddenNap1],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    const ww1 = out.find((e) => e.eventKey === "wake_window_1");
    expect(ww1?.startTime).toBe(7 * 60);
    expect(ww1?.endTime).toBe(9 * 60); // natural — NOT 9:30

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe(10 * 60); // natural — NOT 9:50
    expect(ww2?.endTime).toBe(11 * 60 + 30);

    // The overridden event itself is preserved in events (carries owner forward).
    const napOne = out.find((e) => e.id === overriddenNap1.id);
    expect(napOne).toBeDefined();
    expect(napOne!.lifecycle.state).toBe("overridden");

    // R3.8: overridden's apparent 20-min duration does NOT trigger
    // short-nap-adjust on ww_2. Length still 90.
    expect(ww2!.endTime! - ww2!.startTime).toBe(90);
  });
});

describe("R3.7 — short recorded nap shortens the FOLLOWING wake window", () => {
  it("with recorded nap_1 lasting 20 min (< shortNapThresholdMinutes=35), ww_2 length = default - adjustment", () => {
    // settings: WW [120, 90], short threshold 35, adjustment 10, napLen 60
    // Expected cascade after recorded nap_1 (9:00-9:20):
    //   ww_1: 7:00-9:00
    //   nap_1: 9:00-9:20  (recorded, 20 min — short)
    //   ww_2: 9:20-10:40  (length = 90 - 10 = 80 min)
    //   nap_2: 10:40-11:40
    const recordedNap1 = aRecordedNap({
      id: "actual_nap_1_short",
      eventKey: "nap_1",
      start: 9 * 60,
      end: 9 * 60 + 20,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
        shortNapThresholdMinutes: 35,
        shortNapAdjustmentMinutes: 10,
      }),
      actuals: [recordedNap1],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2).toBeDefined();
    expect(ww2!.startTime).toBe(9 * 60 + 20);
    expect(ww2!.endTime).toBe(10 * 60 + 40);

    // And nap_2 follows the shortened WW.
    const nap2 = out.find((e) => e.eventKey === "nap_2");
    expect(nap2?.startTime).toBe(10 * 60 + 40);
    expect(nap2?.endTime).toBe(11 * 60 + 40);
  });
});

describe("R3.6 — inverted nap data collapses the wake window to zero", () => {
  it("with a recorded nap_2 BEFORE the previous nap ended, ww_2 is zero-length (not inverted)", () => {
    // Cascade: nap_1 projected ends at 10:00; recorded nap_2 starts at 9:30.
    // ww_2 must NOT render with end < start. Clamp endTime to start.
    const recordedNap2 = aRecordedNap({
      id: "actual_nap_2_inverted",
      eventKey: "nap_2",
      start: 9 * 60 + 30,
      end: 10 * 60 + 30,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
      }),
      actuals: [recordedNap2],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2).toBeDefined();
    expect(ww2!.startTime).toBe(10 * 60);
    expect(ww2!.endTime).toBe(10 * 60); // zero-length, not 9:30
    expect(ww2!.endTime).toBeGreaterThanOrEqual(ww2!.startTime);
  });
});

describe("R3.3 — recorded naps coexist with projected cascade", () => {
  it("with a recorded nap_2 at the projected time, output is ww_1, nap_1 (proj), ww_2 (proj), nap_2 (recorded)", () => {
    const recordedNap2 = aRecordedNap({
      id: "actual_nap_2",
      eventKey: "nap_2",
      start: 11 * 60 + 30,
      end: 12 * 60 + 30,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
        defaultNapLengthMinutes: 60,
      }),
      actuals: [recordedNap2],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: NAP_RULES },
    );

    // Exactly 4 events: ww_1, nap_1, ww_2, nap_2 (no duplicate nap_2).
    expect(out.map((e) => e.eventKey)).toEqual([
      "wake_window_1",
      "nap_1",
      "wake_window_2",
      "nap_2",
    ]);

    // The recorded nap_2 must be the one in the output (preserved per §0).
    const napTwo = out.find((e) => e.eventKey === "nap_2");
    expect(napTwo?.id).toBe(recordedNap2.id);
    expect(napTwo?.lifecycle.state).toBe("completed");
  });
});
