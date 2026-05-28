/** R3.x — Nap rules. */

import { describe, expect, it } from "vitest";
import {
  aContext,
  aDay,
  aRecordedBedtime,
  aRecordedNap,
  aSettings,
} from "../../__tests__/factories";
import { NO_OWNER } from "../../schemas";
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

    // ww_1 7:00-9:00, nap_1 9:00-10:00, ww_2 10:00-11:30, nap_2 11:30-12:30.
    // ADR-0006: aContext() defaults nowMinutes=12:00; all four auto-promote to recorded.
    const ww1 = out.find((e) => e.eventKey === "wake_window_1");
    expect(ww1).toMatchObject({
      type: "wake_window",
      kind: "block",
      startTime: 7 * 60,
      endTime: 9 * 60,
      lifecycle: { state: "recorded" },
    });

    const nap1 = out.find((e) => e.eventKey === "nap_1");
    expect(nap1).toMatchObject({
      type: "nap",
      kind: "block",
      startTime: 9 * 60,
      endTime: 10 * 60,
      lifecycle: { state: "recorded" },
    });

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2).toMatchObject({
      type: "wake_window",
      kind: "block",
      startTime: 10 * 60,
      endTime: 11 * 60 + 30,
      lifecycle: { state: "recorded" },
    });

    const nap2 = out.find((e) => e.eventKey === "nap_2");
    expect(nap2).toMatchObject({
      type: "nap",
      kind: "block",
      startTime: 11 * 60 + 30,
      endTime: 12 * 60 + 30,
      lifecycle: { state: "recorded" },
    });
  });
});

describe("R3.4 / R3.5 — wake window endTime tracks the next nap's start", () => {
  it("with a recorded nap_2 LATER than projected, ww_2 stretches to the recorded start", () => {
    // Projected cascade puts nap_2 at 11:30; recorded nap_2 at 13:00 → ww_2 stretches.
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
    // Projected cascade puts nap_2 at 11:30; recorded nap_2 at 10:30 → ww_2 shrinks.
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
  // WW geometry follows whatever nap occupies the slot, regardless of lifecycle.
  // An earlier `overridden` exception caused a gap between WW2.end and user-edited Nap 2.start.

  it("user-edited (overridden) nap_2 at a LATER time → ww_2 stretches to meet it", () => {
    // WW [120, 150], napLen 90: ww_2 10:30-13:00. User edits Nap 2 to 14:00 → ww_2 stretches to 14:00.
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
    expect(ww1?.endTime).toBe(9 * 60); // ends at nap_1 start

    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe(10 * 60 + 30); // starts at nap_1's end
    expect(ww2?.endTime).toBe(14 * 60); // ENDS AT nap_2.start (overridden), NOT cascade default 13:00

    const nap2 = out.find((e) => e.eventKey === "nap_2");
    expect(nap2?.startTime).toBe(14 * 60); // preserved from override
    expect(nap2?.lifecycle.state).toBe("recorded"); // override preserved, not re-promoted
  });

  it("overridden nap_1 at a NON-natural time → ww_1 ends at the override, ww_2 starts at the override's end", () => {
    // Overridden time earlier than cascade default: same invariant applies.
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
    // ww_2 runs its natural length (90min) — overridden duration doesn't trigger short-nap-adjust.
    expect(ww2!.endTime! - ww2!.startTime).toBe(90);

    const napOne = out.find((e) => e.id === overriddenNap1.id);
    expect(napOne).toBeDefined();
    expect(napOne!.lifecycle.state).toBe("recorded");

    // Short-nap-adjust only fires for RECORDED short naps, not overridden.
    expect(ww2!.endTime! - ww2!.startTime).toBe(90);
  });
});

describe("R3.7 — short recorded nap shortens the FOLLOWING wake window", () => {
  it("with recorded nap_1 lasting 20 min (< shortNapThresholdMinutes=35), ww_2 length = default - adjustment", () => {
    // WW [120, 90], short threshold 35, adjustment 10: ww_2 = 90-10 = 80min after 20min nap_1.
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

    // nap_2 follows the shortened WW.
    const nap2 = out.find((e) => e.eventKey === "nap_2");
    expect(nap2?.startTime).toBe(10 * 60 + 40);
    expect(nap2?.endTime).toBe(11 * 60 + 40);
  });
});

describe("R3.6 — inverted nap data collapses the wake window to zero", () => {
  it("with a recorded nap_2 BEFORE the previous nap ended, ww_2 is zero-length (not inverted)", () => {
    // nap_1 ends at 10:00; recorded nap_2 starts at 9:30 → ww_2 clamped to zero-length.
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

    // First 4 events: ww_1, nap_1, ww_2, nap_2 — no duplicate nap_2.
    const firstFourKeys = out
      .filter((e) => e.type === "wake_window" || e.type === "nap")
      .map((e) => e.eventKey)
      .slice(0, 4);
    expect(firstFourKeys).toEqual(["wake_window_1", "nap_1", "wake_window_2", "nap_2"]);

    // Recorded nap_2 is the one in the output (§0 reality-wins).
    const napTwo = out.find((e) => e.eventKey === "nap_2");
    expect(napTwo?.id).toBe(recordedNap2.id);
    expect(napTwo?.lifecycle.state).toBe("completed");
  });
});

describe("Cascade invariant — wake_window/nap boundaries", () => {
  // wake_window(N).startTime === nap(N-1).endTime (wakeTime for N=1)
  // wake_window(N).endTime   === nap(N).startTime
  // No special-casing on lifecycle — WW geometry follows whatever nap occupies the slot.

  function assertInvariant(events: Event[], wakeTime: number) {
    const wws = events
      .filter((e) => e.type === "wake_window")
      .sort((a, b) => {
        const ai = Number(a.eventKey.split("_").pop());
        const bi = Number(b.eventKey.split("_").pop());
        return ai - bi;
      });
    for (const ww of wws) {
      // Optional endTime type is wire-compatibility; wake_windows always have one.
      if (ww.endTime === undefined) throw new Error(`wake_window ${ww.eventKey} missing endTime`);
      const n = Number(ww.eventKey.split("_").pop());
      const napN = events.find((e) => e.eventKey === `nap_${n}`);
      const napPrev = n === 1 ? undefined : events.find((e) => e.eventKey === `nap_${n - 1}`);

      const expectedStart = napPrev?.endTime ?? wakeTime;
      const expectedEnd = napN?.startTime ?? ww.endTime; // ww with no following nap is degenerate; skip
      expect({ ww: ww.eventKey, startTime: ww.startTime }).toEqual({
        ww: ww.eventKey,
        startTime: Math.max(expectedStart, ww.startTime), // inversion clamp at wwStart
      });
      expect({ ww: ww.eventKey, endTime: ww.endTime }).toEqual({
        ww: ww.eventKey,
        endTime: Math.max(ww.startTime, expectedEnd), // inversion clamp
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

describe("R7.6 — bedtimeThreshold triggers bedtime substitution in the cascade", () => {
  it("the first projected nap whose endTime > threshold is dropped; bedtime at max(earliestBedtime, wwStart + WW)", () => {
    // WW [120, 135, 135, 150], napLen 60: ww4 16:30-19:00, nap_4 endTime=20:00 > threshold=19:00.
    // ADR-0002: drop nap_4; bedtime = max(earliestBedtime=18:00, 16:30+150=19:00) = 19:00.
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
    expect(bedtime!.startTime).toBe(19 * 60); // 16:30 + 150min = 19:00
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
    // WW [120, 120, 240, 60, 120]: ww4 18-19, nap_4 endTime=20:00 > threshold=19:00 → drop.
    // Bedtime = max(18:00, 18:00+60=19:00) = 19:00. ww5/nap5 never emitted.
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
  it("nap_4 projected 18:30-19:30 crosses threshold 19:00 → bedtime at max(earliestBedtime=18:00, wwStart+WW=18:30)=18:30", () => {
    // WW [120, 120, 240, 30]: ww4 18:00-18:30, nap_4 endTime=19:30 > threshold=19:00 → drop.
    // Bedtime = max(18:00, 18:00+30=18:30) = 18:30.
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

describe("§F66 fast-follow B8 — bedtime anchors at end of full final wake window", () => {
  it("dropped nap leaves a full-WW gap before bedtime, not a stub at earliestBedtime", () => {
    // Dogfood bug: final WW was only 55min because bedtime stubbed at earliestBedtime.
    // WW=[120], napLen=90: ww4 17:30-19:30; nap4 endTime=21:00 > threshold=18:00 → drop.
    // Bedtime = max(18:00, 17:30+120=19:30) = 19:30. ww_4 is full 120min.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120],
        defaultNapLengthMinutes: 90,
        bedtimeThreshold: 18 * 60,
        earliestBedtime: 18 * 60,
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
    expect(bedtime!.startTime).toBe(19 * 60 + 30); // 17:30 + 120min = 19:30
    // Final WW is full 120min, not stubbed at earliestBedtime.
    const lastWw = out
      .filter((e) => e.type === "wake_window")
      .sort((a, b) => b.startTime - a.startTime)[0];
    expect(lastWw).toBeDefined();
    expect((lastWw!.endTime ?? 0) - lastWw!.startTime).toBe(120);
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

describe("Recorded bedtime gets putdown synth", () => {
  // When the past-threshold prompt converts a nap to bedtime, the doc lifecycle is `overridden`.
  // R6.1 derives hasPutdown from {projected, overridden} — so the putdown chip survives.

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
  // A projected nap overlapping a manual bedtime must be suppressed; WW truncates at bedtime.

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

    expect(out.find((e) => e.eventKey === "nap_1")).toBeUndefined();

    const ww1 = out.find((e) => e.eventKey === "wake_window_1");
    expect(ww1).toBeDefined();
    expect(ww1!.startTime).toBe(18 * 60);
    expect(ww1!.endTime).toBe(19 * 60 + 30); // truncated at bedtime, not projected nap start

    const bedtimes = out.filter((e) => e.type === "bedtime");
    expect(bedtimes).toHaveLength(1);
    expect(bedtimes[0]!.id).toBe(manualBedtime.id);
  });
});

describe("Cascade extends past wakeWindowsMinutes.length (physiology cascade)", () => {
  // wakeWindowsMinutes is a cadence sequence; the last value repeats until bedtimeThreshold.

  it("with wws=[120], cascade emits nap_1, nap_2, nap_3, ... until threshold", () => {
    // wws=[120], napLen 60: repeats WW=120 → ww_4 16-18, nap_4 18-19 crosses threshold → bedtime.
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

    expect(out.find((e) => e.eventKey === "nap_1")).toBeDefined();
    expect(out.find((e) => e.eventKey === "nap_2")).toBeDefined();
    expect(out.find((e) => e.eventKey === "nap_3")).toBeDefined();

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBeGreaterThanOrEqual(19 * 60);
  });

  it("with wws=[120, 90], cascade uses 90-min WW from position 2 onward", () => {
    // wws=[120, 90]: WW=90 repeats; ww_5 17:30-19:00, nap_5 endTime=20:00 > threshold.
    // ADR-0002: drop nap_5; bedtime = max(18:00, 17:30+90=19:00) = 19:00.
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
    // wws=[60], napLen=60: slots 1-4 cascade at 60min; slot 5 anchors at recorded nap_5 (16:00).
    // ww_5 = 15:00-16:00 (ends at recorded nap_5 start).
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

    // ww_5 ends at the recorded nap_5's start.
    const ww5 = out.find((e) => e.eventKey === "wake_window_5");
    expect(ww5).toBeDefined();
    expect(ww5!.endTime).toBe(16 * 60);
  });
});

describe("§F66 bedtime cascade — ADR-0002", () => {
  // ADR-0002: drop projected naps with endTime > bedtimeThreshold;
  // bedtime.startTime = max(earliestBedtime, lastNapEnd + WW).
  // Fixes §F64: old rule placed bedtime at napStart, which could be < earliestBedtime.

  it("drop projected nap whose endTime > bedtimeThreshold; bedtime lands at earliestBedtime floor", () => {
    // threshold=17:30, earliestBedtime=18:00, WW=120, napLen=45:
    // nap_4 endTime=18:00 > 17:30 → drop; bedtime = max(18:00, 17:15) = 18:00.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120],
        defaultNapLengthMinutes: 45,
        bedtimeThreshold: 17 * 60 + 30,
        earliestBedtime: 18 * 60,
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
      { rules: ALL_RULES },
    );

    const projectedNapsPastThreshold = out.filter(
      (e) =>
        e.type === "nap" && e.lifecycle.state === "projected" && (e.endTime ?? 0) > 17 * 60 + 30,
    );
    expect(projectedNapsPastThreshold).toHaveLength(0);

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBe(18 * 60);
  });

  it("bedtime floor: startTime = max(earliestBedtime, lastNapEnd + WW) when cascade-natural time < floor", () => {
    // threshold=17:30, earliestBedtime=18:00, WW=120: recorded nap_1 13:30-15:00 →
    // ww_2 15:00-17:00, nap_2 endTime=18:00 > 17:30 → drop; bedtime = max(18:00, 17:00) = 18:00.
    const recordedNap1 = aRecordedNap({
      eventKey: "nap_1",
      start: 13 * 60 + 30,
      end: 15 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 17 * 60 + 30,
        earliestBedtime: 18 * 60,
        defaultWakeTime: 7 * 60,
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
      { rules: ALL_RULES },
    );

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBe(18 * 60);
  });

  it("§F64 regression: bedtime.startTime >= earliestBedtime; no projected nap past threshold", () => {
    // threshold=17:30, earliestBedtime=18:00: recorded nap ends 13:14 →
    // nap at 17:59-18:44 → endTime > 17:30 → drop; bedtime = max(18:00, 17:59) = 18:00.
    const recordedNap1 = aRecordedNap({
      eventKey: "nap_1",
      start: 12 * 60 + 30,
      end: 13 * 60 + 14,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120],
        defaultNapLengthMinutes: 45,
        bedtimeThreshold: 17 * 60 + 30,
        earliestBedtime: 18 * 60,
        defaultWakeTime: 7 * 60,
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
      { rules: ALL_RULES },
    );

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.startTime).toBeGreaterThanOrEqual(18 * 60);

    const projectedNapsPastThreshold = out.filter(
      (e) =>
        e.type === "nap" && e.lifecycle.state === "projected" && (e.endTime ?? 0) > 17 * 60 + 30,
    );
    expect(projectedNapsPastThreshold).toHaveLength(0);
  });
});

describe("Start Nap Now mid-window — recorded nap absorbs the slot", () => {
  // Tapping "Start Nap Now" produced two nap_4 events: the recorded one and the still-projected one.
  // Cascade should absorb the slot on the recorded eventKey and not emit a projected duplicate.
  it("a 'recorded' (in-progress, no endTime) nap_4 produces exactly one nap_4 and shrinks ww_4", () => {
    const startedNap4: Event = {
      id: "nap_4",
      dayId: "day_test",
      eventKey: "nap_4",
      type: "nap",
      kind: "block",
      startTime: 15 * 60 + 35, // 15:35
      label: "Nap 4",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 15 * 60 + 35 },
      // No endTime: in-progress nap; effectiveEndOf auto-extends at render time.
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        // Five 2h wake windows: nap_1 9:00, nap_2 11:45, nap_3 14:20, nap_4 (projected) 16:20.
        wakeWindowsMinutes: [120, 120, 120, 120, 120],
        defaultNapLengthMinutes: 45,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [startedNap4],
      nowMinutes: 15 * 60 + 35,
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

    const nap4s = out.filter((e) => e.type === "nap" && e.eventKey === "nap_4");
    expect(nap4s).toHaveLength(1);
    expect(nap4s[0]!.id).toBe(startedNap4.id);
    expect(nap4s[0]!.lifecycle.state).toBe("recorded");
    expect(nap4s[0]!.startTime).toBe(15 * 60 + 35);

    // ww_4 ends at the recorded nap start (15:35), not the projected start (16:20).
    const ww4 = out.find((e) => e.eventKey === "wake_window_4");
    expect(ww4?.endTime).toBe(15 * 60 + 35);
  });
});
