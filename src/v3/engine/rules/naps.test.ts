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
