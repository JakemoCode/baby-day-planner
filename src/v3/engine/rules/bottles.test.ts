/**
 * R5.x — Bottle rules.
 *
 * Tests-first per CLAUDE.md TDD protocol.
 */

import { describe, expect, it } from "vitest";
import {
  aContext,
  aDay,
  aRecordedBottle,
  aRecordedNap,
  aSettings,
} from "../../__tests__/factories";
import type { Rule } from "../evaluator";
import { projectDay } from "../projectDay";
import { RULES as NAP_RULES } from "./naps";
import { RULES as BOTTLE_RULES } from "./bottles";

const ALL: Rule[] = [...BOTTLE_RULES];
const ALL_WITH_NAPS: Rule[] = [...NAP_RULES, ...BOTTLE_RULES];

describe("R5.11 — placeholder projection when no bottle has been recorded", () => {
  it("projects bottlesPerDay placeholders, anchored at wake + buffer, spaced by interval", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
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

    const bottles = out.filter((e) => e.type === "bottle");
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // 7:10
      10 * 60 + 10, // 10:10
      13 * 60 + 10, // 13:10
      16 * 60 + 10, // 16:10
    ]);

    // All projected (none recorded yet).
    expect(bottles.every((b) => b.lifecycle.state === "projected")).toBe(true);
    // All instant.
    expect(bottles.every((b) => b.kind === "instant")).toBe(true);
  });
});

describe("R5.8 — cascade stops when the next projected start would cross tomorrow's wake", () => {
  it("bottlesPerDay=20 caps at the last slot before defaultWakeTime + 24h", () => {
    // Recorded bottle_1 at 7:30; interval 180; defaultWakeTime 7:00.
    // Cascade slots:
    //   1 (rec) 7:30 = 450
    //   2 10:30 = 630
    //   3 13:30 = 810
    //   4 16:30 = 990
    //   5 19:30 = 1170
    //   6 22:30 = 1350
    //   7 01:30 next day = 1530
    //   8 04:30 = 1710
    //   9 07:30 = 1890  ← ≥ tomorrow's wake (1860). STOP before this.
    const recorded = aRecordedBottle({
      id: "actual_bottle_first",
      eventKey: "bottle_1",
      start: 7 * 60 + 30,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 20, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [recorded],
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

    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);

    expect(bottles).toHaveLength(8);
    expect(bottles[bottles.length - 1]!.startTime).toBe(28 * 60 + 30); // 04:30 next day
  });
});

describe("R5.4 — bottles renumbered chronologically for display", () => {
  it("two recorded bottles with non-chronological eventKeys end up renumbered in time order", () => {
    // The user logged bottle_1 at 9:00, then later remembered an earlier
    // bottle and FAB-inserted it at 7:30 with eventKey 'bottle_2'.
    // Engine output should renumber so the 7:30 one is 'bottle_1'.
    const lateInserted = aRecordedBottle({
      id: "b_late_insert",
      eventKey: "bottle_2",
      start: 7 * 60 + 30,
    });
    const firstLogged = aRecordedBottle({
      id: "b_first_logged",
      eventKey: "bottle_1",
      start: 9 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 2, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
      }),
      actuals: [lateInserted, firstLogged],
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

    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);

    expect(bottles).toHaveLength(2);
    expect(bottles[0]!.id).toBe("b_late_insert"); // 7:30 one
    expect(bottles[0]!.eventKey).toBe("bottle_1");
    expect(bottles[0]!.label).toBe("Bottle 1");
    expect(bottles[1]!.id).toBe("b_first_logged"); // 9:00 one
    expect(bottles[1]!.eventKey).toBe("bottle_2");
    expect(bottles[1]!.label).toBe("Bottle 2");
  });
});

describe("R5.1 — cascade resumes from the latest recorded bottle", () => {
  it("with one recorded bottle at 8:30, projects the remaining bottles_per_day at interval", () => {
    const recorded = aRecordedBottle({
      id: "actual_bottle_1",
      eventKey: "bottle_1",
      start: 8 * 60 + 30,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
      }),
      actuals: [recorded],
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

    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);

    // 4 bottles total: 1 recorded at 8:30 + 3 projected at 11:30, 14:30, 17:30.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60 + 30,
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
    ]);

    // The recorded one is preserved untouched (§0).
    const first = bottles[0]!;
    expect(first.id).toBe(recorded.id);
    expect(first.lifecycle.state).toBe("completed");

    // The projections are projected and instant.
    const projections = bottles.slice(1);
    expect(projections.every((b) => b.lifecycle.state === "projected")).toBe(true);
    expect(projections.every((b) => b.kind === "instant")).toBe(true);
  });
});

describe("R5.6 — convergence regression with various nowMinutes", () => {
  it.each([0, 5 * 60, 10 * 60, 15 * 60, 20 * 60])("converges with nowMinutes=%i", (now) => {
    const recordedBottle = aRecordedBottle({
      id: "rec_b1",
      eventKey: "bottle_1",
      start: 8 * 60 + 15,
    });
    const recordedNap = aRecordedNap({
      id: "rec_n1",
      eventKey: "nap_recorded_616",
      start: 10 * 60 + 16,
      end: 12 * 60 + 14,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 5 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [120, 135, 135, 150],
      }),
      actuals: [recordedBottle, recordedNap],
      nowMinutes: now,
    });

    expect(() =>
      projectDay(
        {
          day: ctx.day,
          settings: ctx.settings,
          actuals: ctx.actuals,
          nowMinutes: ctx.nowMinutes,
        },
        { rules: ALL_WITH_NAPS },
      ),
    ).not.toThrow();
  });
});

describe("R5.6 — convergence regression (mirrors property-test failure)", () => {
  it("converges with recorded bottle at 8:15 + recorded nap 10:16-12:14 + early wake", () => {
    // Reproduces a property-test convergence failure where bottle_2 from
    // the cascade lands inside a recorded nap and R5.6 must terminate.
    const recordedBottle = aRecordedBottle({
      id: "rec_b1",
      eventKey: "bottle_1",
      start: 8 * 60 + 15, // 495
    });
    const recordedNap = aRecordedNap({
      id: "rec_n1",
      eventKey: "nap_recorded_616",
      start: 10 * 60 + 16, // 616
      end: 12 * 60 + 14, // 734
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 5 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [120, 135, 135, 150],
      }),
      actuals: [recordedBottle, recordedNap],
      nowMinutes: 12 * 60,
    });

    expect(() =>
      projectDay(
        {
          day: ctx.day,
          settings: ctx.settings,
          actuals: ctx.actuals,
          nowMinutes: ctx.nowMinutes,
        },
        { rules: ALL_WITH_NAPS },
      ),
    ).not.toThrow();
  });
});

describe("R5.6 — projected bottle inside a nap moves to the closer edge", () => {
  it("placeholder bottle landing in nap_1 moves to nap_1.startTime when that's nearer the predicted interval", () => {
    // Setup:
    //   wake 7:00, buffer 10, interval 180, bottlesPerDay 4, now 8:00
    //   recorded nap_1 from 9:30-11:00 (covers default placeholder slot 10:10)
    //
    // R5.11 places placeholders at 7:10, 10:10, 13:10, 16:10.
    // bottle_2 at 10:10 is inside [9:30, 11:00].
    //   predicted (prev 7:10 + 180) = 10:10
    //   nap_1.start = 9:30, distance |10:10 - 9:30| = 40
    //   nap_1.end   = 11:00, distance |11:00 - 10:10| = 50
    //   → move to 9:30 (closer).
    // 9:30 is in the future relative to nowMinutes=8:00, so no past-edge fallback.
    const recordedNap1 = aRecordedNap({
      id: "actual_nap_1",
      eventKey: "nap_1",
      start: 9 * 60 + 30,
      end: 11 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [120, 90, 90, 90],
      }),
      actuals: [recordedNap1],
      nowMinutes: 8 * 60,
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_WITH_NAPS },
    );

    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);

    // bottle_2 (10:10) lands inside recorded nap_1 → moves to 9:30 (closer to predicted 10:10).
    // R3.1 also projects nap_2 at [12:30, 13:30] (cascade from nap_1.end 11:00 + ww_2 90min).
    // bottle_3 (13:10) lands inside that projected nap → moves to 12:30 (closer to predicted 12:30 from new bottle_2 9:30 + 180).
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // 7:10 (unchanged)
      9 * 60 + 30, // 9:30 (moved from 10:10 → nap_1.start)
      12 * 60 + 30, // 12:30 (moved from 13:10 → projected nap_2.start)
      16 * 60 + 10, // 16:10 (unchanged; no nap there)
    ]);

    // No bottle's startTime falls strictly inside any nap.
    const naps = out.filter((e) => e.type === "nap" && e.endTime !== undefined);
    for (const b of bottles) {
      for (const nap of naps) {
        const inside = b.startTime > nap.startTime && b.startTime < nap.endTime!;
        expect(inside).toBe(false);
      }
    }
  });
});
