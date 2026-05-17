/**
 * R3.x — Nap rules.
 *
 * Tests-first per CLAUDE.md TDD protocol. Each rule's failing test lands
 * before the implementation; new behavior gets a new failing test before
 * any code change.
 */

import { describe, expect, it } from "vitest";
import {
  aContext,
  aDay,
  aRecordedBedtime,
  aRecordedNap,
  aSettings,
} from "../../__tests__/factories";
import type { Event } from "../../schemas";
import { projectDay } from "../projectDay";
import { RULES as NAP_RULES } from "./naps";
import { ALL_RULES } from "./index";

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

    // Expected cascade for the first 2 slots (cadence-extension carries
    // it past the configured array under the physiology cascade — we
    // assert the relevant chain prefix here).
    //   ww_1 : 7:00 → 9:00   (120 min)
    //   nap_1: 9:00 → 10:00  (60 min)
    //   ww_2 : 10:00 → 11:30 (90 min)
    //   nap_2: 11:30 → 12:30 (60 min)
    const ww1 = out.find((e) => e.eventKey === "wake_window_1");
    expect(ww1).toMatchObject({
      type: "wake_window",
      kind: "block",
      startTime: 7 * 60,
      endTime: 9 * 60,
      lifecycle: { state: "projected" },
    });

    const nap1 = out.find((e) => e.eventKey === "nap_1");
    expect(nap1).toMatchObject({
      type: "nap",
      kind: "block",
      startTime: 9 * 60,
      endTime: 10 * 60,
      lifecycle: { state: "projected" },
    });

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2).toMatchObject({
      type: "wake_window",
      kind: "block",
      startTime: 10 * 60,
      endTime: 11 * 60 + 30,
      lifecycle: { state: "projected" },
    });

    const nap2 = out.find((e) => e.eventKey === "nap_2");
    expect(nap2).toMatchObject({
      type: "nap",
      kind: "block",
      startTime: 11 * 60 + 30,
      endTime: 12 * 60 + 30,
      lifecycle: { state: "projected" },
    });
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

describe("R3.4/R3.5 — wake_window(N).endTime always tracks nap(N).startTime", () => {
  // Invariant (Jake 2026-05-12): the wake window before a nap ends
  // where the nap starts. Period. Independent of how the nap got there
  // — projected, started, completed, or overridden. The previous
  // version of this file carved out an exception for `overridden`
  // (treated as "owner-only annotation, don't pin time"), but that
  // exception broke drawer time-edits after PR #117 made those edits
  // produce `overridden`: WW2 stayed at its natural cascade tick and
  // left a visible gap between WW2.end and the user-edited Nap 2.start.
  // The simpler invariant beats the exception.

  it("user-edited (overridden) nap_2 at a LATER time → ww_2 stretches to meet it", () => {
    // Cascade defaults: WW [120, 150], napLen 90, wake 7:00.
    //   ww_1 7:00-9:00, nap_1 9:00-10:30, ww_2 10:30-13:00, nap_2 13:00-14:30.
    // User drawer-edits Nap 2 to 14:00-15:30. Under the invariant,
    // ww_2 must stretch from 10:30 to 14:00 — no gap.
    const overriddenNap2 = aRecordedNap({
      id: "manual_nap_2",
      eventKey: "nap_2",
      start: 14 * 60,
      end: 15 * 60 + 30,
      lifecycle: { state: "recorded", annotatedAt: 13 * 60 },
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 150],
        defaultNapLengthMinutes: 90,
      }),
      actuals: [overriddenNap2],
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
    expect(ww1?.endTime).toBe(9 * 60); // ends at nap_1's projected start

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe(10 * 60 + 30); // starts at nap_1's end
    expect(ww2?.endTime).toBe(14 * 60); // ENDS AT nap_2.start (overridden), NOT cascade default 13:00

    const nap2 = out.find((e) => e.eventKey === "nap_2");
    expect(nap2?.startTime).toBe(14 * 60); // preserved from override
    expect(nap2?.lifecycle.state).toBe("recorded"); // not promoted
  });

  it("overridden nap_1 at a NON-natural time → ww_1 ends at the override, ww_2 starts at the override's end", () => {
    // The companion case: overridden time EARLIER than cascade default.
    // Same invariant: WW geometry follows the nap, not the wakeWindowsMinutes.
    const overriddenNap1 = aRecordedNap({
      id: "annotated_nap_1",
      eventKey: "nap_1",
      start: 9 * 60 + 30,
      end: 9 * 60 + 50,
      lifecycle: { state: "recorded", annotatedAt: 8 * 60 },
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
    expect(ww1?.endTime).toBe(9 * 60 + 30); // ends at the overridden nap_1's start

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe(9 * 60 + 50); // starts at the overridden nap_1's end
    // ww_2 then runs its natural length until projected nap_2 starts.
    expect(ww2!.endTime! - ww2!.startTime).toBe(90);

    // The overridden event itself is preserved in events (carries owner forward).
    const napOne = out.find((e) => e.id === overriddenNap1.id);
    expect(napOne).toBeDefined();
    expect(napOne!.lifecycle.state).toBe("recorded");

    // R3.8: overridden's apparent 20-min duration does NOT trigger
    // short-nap-adjust on ww_2 (only RECORDED short naps do).
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

    // The first 4 events are ww_1, nap_1, ww_2, nap_2 (no duplicate
    // nap_2). The cascade extends past wws.length under the physiology
    // cascade; we assert the relevant chain prefix here.
    const firstFourKeys = out
      .filter((e) => e.type === "wake_window" || e.type === "nap")
      .map((e) => e.eventKey)
      .slice(0, 4);
    expect(firstFourKeys).toEqual(["wake_window_1", "nap_1", "wake_window_2", "nap_2"]);

    // The recorded nap_2 must be the one in the output (preserved per §0).
    const napTwo = out.find((e) => e.eventKey === "nap_2");
    expect(napTwo?.id).toBe(recordedNap2.id);
    expect(napTwo?.lifecycle.state).toBe("completed");
  });
});

describe("Cascade invariant — wake_window/nap boundaries (Jake 2026-05-12)", () => {
  // Invariant, asserted programmatically across multiple scenarios:
  //   wake_window(N).startTime === nap(N-1).endTime    (Day.wakeTime for N=1)
  //   wake_window(N).endTime   === nap(N).startTime
  //
  // Wake windows END because naps START; wake windows START because
  // naps END. The cascade has NO special-casing on lifecycle state —
  // the WW geometry follows whatever nap occupies the slot.

  function assertInvariant(events: Event[], wakeTime: number) {
    const wws = events
      .filter((e) => e.type === "wake_window")
      .sort((a, b) => {
        const ai = Number(a.eventKey.split("_").pop());
        const bi = Number(b.eventKey.split("_").pop());
        return ai - bi;
      });
    for (const ww of wws) {
      // wake_windows are always blocks with endTime; the optional type is
      // a wire-compatibility artifact.
      if (ww.endTime === undefined) throw new Error(`wake_window ${ww.eventKey} missing endTime`);
      const n = Number(ww.eventKey.split("_").pop());
      const napN = events.find((e) => e.eventKey === `nap_${n}`);
      const napPrev = n === 1 ? undefined : events.find((e) => e.eventKey === `nap_${n - 1}`);

      const expectedStart = napPrev?.endTime ?? wakeTime;
      const expectedEnd = napN?.startTime ?? ww.endTime; // ww with no following nap is degenerate; skip
      expect({ ww: ww.eventKey, startTime: ww.startTime }).toEqual({
        ww: ww.eventKey,
        startTime: Math.max(expectedStart, ww.startTime), // R3.6 inversion clamp at wwStart
      });
      expect({ ww: ww.eventKey, endTime: ww.endTime }).toEqual({
        ww: ww.eventKey,
        endTime: Math.max(ww.startTime, expectedEnd), // R3.6 inversion clamp
      });
    }
  }

  it("empty actuals: all-projected cascade preserves the invariant", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 150, 180], defaultNapLengthMinutes: 60 }),
      actuals: [],
    });
    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_RULES },
    );
    assertInvariant(out, 7 * 60);
  });

  it("overridden nap_2 later than default: ww_2 stretches; invariant holds", () => {
    const overriddenNap2 = aRecordedNap({
      eventKey: "nap_2",
      start: 14 * 60,
      end: 15 * 60 + 30,
      lifecycle: { state: "recorded", annotatedAt: 13 * 60 },
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 150], defaultNapLengthMinutes: 90 }),
      actuals: [overriddenNap2],
    });
    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_RULES },
    );
    assertInvariant(out, 7 * 60);
  });

  it("recorded nap_1 earlier than default: ww_2 starts at the recorded end; invariant holds", () => {
    const recordedNap1 = aRecordedNap({
      eventKey: "nap_1",
      start: 8 * 60 + 30,
      end: 9 * 60 + 15,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 90], defaultNapLengthMinutes: 60 }),
      actuals: [recordedNap1],
    });
    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_RULES },
    );
    assertInvariant(out, 7 * 60);
  });

  it("mix: recorded nap_1 + overridden nap_2 + projected nap_3 all chain correctly", () => {
    const recordedNap1 = aRecordedNap({ eventKey: "nap_1", start: 9 * 60 + 5, end: 10 * 60 + 10 });
    const overriddenNap2 = aRecordedNap({
      eventKey: "nap_2",
      start: 13 * 60 + 30,
      end: 15 * 60,
      lifecycle: { state: "recorded", annotatedAt: 12 * 60 },
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 150, 180],
        defaultNapLengthMinutes: 60,
      }),
      actuals: [recordedNap1, overriddenNap2],
    });
    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_RULES },
    );
    assertInvariant(out, 7 * 60);
  });
});

// ---------------------------------------------------------------------------
// Bedtime substitution within the sleep cascade
// (formerly R7.6 / R7.5 / R7.11 / R7.4 / R7.4b / R7.7, now inline in R3.1)
// ---------------------------------------------------------------------------

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
      { rules: NAP_RULES },
    );

    expect(out.find((e) => e.eventKey === "nap_4")).toBeUndefined();

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
      { rules: NAP_RULES },
    );

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.endTime).toBe(7 * 60 + 24 * 60);
  });
});

describe("R7.4 / R7.4b — no projected naps or wake_windows past bedtime", () => {
  it("with a 5-WW cascade that would project nap_5 at 22:00, only bedtime and earlier slots survive", () => {
    // WW = [120, 120, 240, 60, 120], napLen 60, wake 7:00:
    //   ww1: 7-9,   nap1: 9-10
    //   ww2: 10-12, nap2: 12-13
    //   ww3: 13-17, nap3: 17-18
    //   ww4: 18-19, nap4: 19-20    ← becomes bedtime at 19:00
    //   ww5/nap5 are never emitted (cascade stops at bedtime).
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
      { rules: NAP_RULES },
    );

    expect(out.find((e) => e.eventKey === "nap_5")).toBeUndefined();
    expect(out.find((e) => e.eventKey === "wake_window_5")).toBeUndefined();
    expect(out.find((e) => e.eventKey === "bedtime")?.startTime).toBe(19 * 60);
    expect(out.find((e) => e.eventKey === "nap_1")).toBeDefined();
    expect(out.find((e) => e.eventKey === "nap_3")).toBeDefined();
  });

  it("no orphan wake_window emitted past bedtime even with 5 wake-windows configured", () => {
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
      { rules: NAP_RULES },
    );

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    const orphan = out.filter((e) => e.type === "wake_window" && e.startTime >= bedtime!.startTime);
    expect(orphan).toHaveLength(0);
  });
});

describe("R7.5 — projected nap CROSSING the threshold becomes bedtime", () => {
  it("nap_4 projected 18:30-19:30 crosses threshold 19:00 → bedtime at 18:30", () => {
    // WW [120, 120, 240, 30], napLen 60, wake 7:00 →
    //   ww4: 18-18:30, nap4: 18:30-19:30  ← crosses threshold
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
      { rules: NAP_RULES },
    );

    expect(out.find((e) => e.eventKey === "nap_4")).toBeUndefined();
    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBe(18 * 60 + 30);
  });
});

describe("R7.7 — manual bedtime is the user's authoritative declaration", () => {
  it("with a recorded bedtime at 18:00, threshold (19:00) does NOT substitute another", () => {
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
      { rules: NAP_RULES },
    );

    const bedtimes = out.filter((e) => e.type === "bedtime");
    expect(bedtimes).toHaveLength(1);
    expect(bedtimes[0]!.id).toBe(recordedBedtime.id);
    expect(bedtimes[0]!.startTime).toBe(18 * 60);
    expect(bedtimes[0]!.lifecycle.state).toBe("completed");

    expect(out.find((e) => e.eventKey === "nap_4")).toBeUndefined();
    expect(out.find((e) => e.eventKey === "nap_5")).toBeUndefined();
  });
});

describe("Overridden bedtime gets putdown synth (regression: 2026-05-15 conversion-loses-putdown bug)", () => {
  // When the past-threshold "Change to bedtime?" prompt converts a
  // nap to bedtime, the bedtime doc has lifecycle `overridden`. The
  // putdown rule (R6.1) derives hasPutdown from {projected,overridden}
  // — `overridden` IS in the set, so the putdown chip survives the
  // conversion. (Earlier code used `started` lifecycle, which silently
  // dropped the putdown chip.)

  it("a manually-recorded bedtime with `overridden` lifecycle gets hasPutdown=true via R6.1", () => {
    const overriddenBedtime = aRecordedBedtime({
      id: "manual_bedtime",
      eventKey: "bedtime",
      start: 19 * 60 + 5,
      end: 31 * 60,
      lifecycle: { state: "recorded", annotatedAt: 19 * 60 },
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90, 90, 90, 90],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [overriddenBedtime],
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_RULES },
    );

    const bedtime = out.find((e) => e.id === overriddenBedtime.id);
    expect(bedtime).toBeDefined();
    expect(bedtime!.hasPutdown).toBe(true);
  });
});

describe("Manual bedtime suppresses any projected nap that would extend INTO it", () => {
  // Click-test bug 2026-05-15: user converted nap_5 to bedtime via the
  // past-threshold prompt at 19:05; cascade kept projecting nap_5 from
  // 18:50-19:35 (default 45-min duration), overlapping the manual
  // bedtime visually. Per DOMAIN.md §3 ("once bedtime hits, it's all
  // bedtime") any projected nap that would extend INTO the manual
  // bedtime must be suppressed and the WW truncated at bedtime.

  it("projected nap_1 19:00-19:45 + manual bedtime 19:30 → ww_1 truncates at bedtime, no nap_1 emitted", () => {
    const manualBedtime = aRecordedBedtime({
      id: "manual_bedtime",
      eventKey: "bedtime",
      start: 19 * 60 + 30,
      end: 31 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 18 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [60],
        defaultNapLengthMinutes: 45,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [manualBedtime],
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

    // No projected nap_1 — it would have extended into bedtime.
    expect(out.find((e) => e.eventKey === "nap_1")).toBeUndefined();

    // ww_1 truncates at the manual bedtime's startTime, not at the
    // would-be projected nap's startTime.
    const ww1 = out.find((e) => e.eventKey === "wake_window_1");
    expect(ww1).toBeDefined();
    expect(ww1!.startTime).toBe(18 * 60);
    expect(ww1!.endTime).toBe(19 * 60 + 30);

    // Manual bedtime preserved as-is.
    const bedtimes = out.filter((e) => e.type === "bedtime");
    expect(bedtimes).toHaveLength(1);
    expect(bedtimes[0]!.id).toBe(manualBedtime.id);
  });
});

describe("Cascade extends past wakeWindowsMinutes.length (physiology cascade)", () => {
  // Per docs/superpowers/specs/2026-05-15-physiology-cascade-design.md:
  // The wakeWindowsMinutes array is a CADENCE sequence, not a slot
  // count. The cascade walks until the next projected nap would cross
  // bedtimeThreshold, using the last WW value past the configured
  // array.

  it("with wws=[120], cascade emits nap_1, nap_2, nap_3, ... until threshold", () => {
    // wakeTime 7:00, wws=[120], napLen 60, threshold 19:00.
    // Each rhythm position uses WW=120 (repeats last):
    //   ww_1 7-9, nap_1 9-10, ww_2 10-12, nap_2 12-13, ww_3 13-15,
    //   nap_3 15-16, ww_4 16-18, nap_4 18-19 → threshold reached →
    //   bedtime at 19:00 (nap_4 would cross threshold).
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120],
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
      { rules: NAP_RULES },
    );

    // Multiple naps emitted past the single-element array.
    expect(out.find((e) => e.eventKey === "nap_1")).toBeDefined();
    expect(out.find((e) => e.eventKey === "nap_2")).toBeDefined();
    expect(out.find((e) => e.eventKey === "nap_3")).toBeDefined();

    // Bedtime terminates the cascade.
    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBeGreaterThanOrEqual(19 * 60);
  });

  it("with wws=[120, 90], cascade uses 90-min WW from position 2 onward", () => {
    // wakeTime 7:00, wws=[120, 90], napLen 60, threshold 19:00.
    //   ww_1 7-9, nap_1 9-10 (WW=120)
    //   ww_2 10-11:30, nap_2 11:30-12:30 (WW=90)
    //   ww_3 12:30-14, nap_3 14-15 (WW=90, repeated)
    //   ww_4 15-16:30, nap_4 16:30-17:30 (WW=90)
    //   ww_5 17:30-19, projected nap would start at 19:00 → bedtime.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 90],
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
      { rules: NAP_RULES },
    );

    const nap3 = out.find((e) => e.eventKey === "nap_3");
    expect(nap3).toBeDefined();
    expect(nap3!.startTime).toBe(14 * 60);
    expect(nap3!.endTime).toBe(15 * 60);

    const nap4 = out.find((e) => e.eventKey === "nap_4");
    expect(nap4).toBeDefined();
    expect(nap4!.startTime).toBe(16 * 60 + 30);

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBe(19 * 60);
  });

  it("slot-keyed recorded nap_5 anchors slot 5 even when wws.length=1", () => {
    // wws=[60] (single-element cadence), napLen=60, threshold=19:00,
    // recorded nap_5 at 16:00-17:00. Cascade walks slots 1-4 with the
    // repeated 60-min WW (nap_1 8-9, nap_2 10-11, nap_3 12-13, nap_4
    // 14-15), then at slot 5 finds the recorded nap_5 and anchors:
    // ww_5 = 15:00 → 16:00 (recorded nap_5 starts).
    const recordedNap5 = aRecordedNap({
      id: "actual_nap_5",
      eventKey: "nap_5",
      start: 16 * 60,
      end: 17 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [60],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [recordedNap5],
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

    const napFive = out.find((e) => e.id === recordedNap5.id);
    expect(napFive).toBeDefined();
    expect(napFive!.startTime).toBe(16 * 60);

    // Wake window 5 ends at the recorded nap_5's start.
    const ww5 = out.find((e) => e.eventKey === "wake_window_5");
    expect(ww5).toBeDefined();
    expect(ww5!.endTime).toBe(16 * 60);
  });
});
