/**
 * R5.x — Bottle rules.
 *
 * Tests-first per CLAUDE.md TDD protocol.
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../../schemas";
import {
  aContext,
  aDay,
  aProjectedBottle,
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
// NAP_RULES now emits bedtime inline (formerly bedtime.ts). Kept as a
// distinct alias for test readability — bottle tests that depend on the
// sleep cascade's bedtime emission use this set.
const ALL_WITH_BEDTIME: Rule[] = [...NAP_RULES, ...BOTTLE_RULES];

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

describe("R5.8 — cascade stops at midnight (the 'midnight rule', DOMAIN.md §2)", () => {
  it("bottlesPerDay=20 caps at the last slot before midnight (1440)", () => {
    // Recorded bottle_1 at 7:30; interval 180; defaultWakeTime 7:00.
    // Cascade slots (within today's calendar day):
    //   1 (rec) 7:30 = 450
    //   2 10:30 = 630
    //   3 13:30 = 810
    //   4 16:30 = 990
    //   5 19:30 = 1170
    //   6 22:30 = 1350
    //   7 01:30 next day = 1530  ← ≥ midnight (1440). STOP before this.
    // Total: 6 bottles within today; bottle #7 belongs to tomorrow.
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

    expect(bottles).toHaveLength(6);
    expect(bottles[bottles.length - 1]!.startTime).toBe(22 * 60 + 30); // 22:30
    // No bottle in today's chain past midnight.
    expect(bottles.every((b) => b.startTime < 24 * 60)).toBe(true);
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

    // The cascade extends past bottlesPerDay (cold-start target only;
    // see "bottlesPerDay is a cold-start target" describe block below).
    // This test only cares about chronological renumbering of the two
    // recorded bottles.
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

    // 1 recorded at 8:30 + cascade forward to midnight at interval=180:
    //   11:30, 14:30, 17:30, 20:30, 23:30 (5 projections; next would be
    //   26:30 ≥ 1440 → stop). bottlesPerDay=4 is the cold-start target,
    //   not a hard cap — anchored cascade extends to midnight.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60 + 30,
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
      20 * 60 + 30,
      23 * 60 + 30,
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

describe("Sequential cascade — bottle landing in nap snaps to nap.start (wind-down allowed)", () => {
  it("a projected bottle landing inside nap_1 snaps to nap.start, NOT to nap.start - putdownLead", () => {
    // Per DOMAIN.md §4 / SIMPLIFICATION_SCOPE.md §2.1, the no-feed
    // region is `[nap.start, nap.end]` only. Wind-down (putdown) is
    // render-only synthetic; a bottle CAN land during it (often IS
    // the wind-down: baby drinks → drowsy → sleep).
    //
    // Setup: wake 7:05, buffer 10 → bottle_1 at 7:15. Interval 180 →
    // bottle_2 proposed at 10:15. Recorded nap_1 at [10:00, 11:00].
    //   - 10:15 is strictly inside (10:00, 11:00). Snap.
    //   - distBefore (10:15 → 10:00) = 15
    //   - distAfter (11:00 → 10:15) = 45
    //   - closer = 10:00. nowMinutes 8:00 < 10:00, so no past-fallback.
    //   - bottle_2 = 10:00 (= nap.start; wind-down allowed).
    //
    // Old rule snapped to 9:45 (= nap.start - putdownLead). The
    // current behavior intentionally drops that — bottle right into
    // naptime is a real, common pattern.
    const recordedNap1 = aRecordedNap({
      id: "actual_nap_putdown",
      eventKey: "nap_1",
      start: 10 * 60,
      end: 11 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 + 5 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 2, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [],
        putdownLeadMinutes: 15,
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
      .filter((e) => e.type === "bottle" && e.lifecycle.state === "projected")
      .sort((a, b) => a.startTime - b.startTime);
    // Snap to nap.start (10:00), not nap.start - putdownLead (9:45).
    expect(bottles[bottles.length - 1]!.startTime).toBe(10 * 60);
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

describe("Sequential cascade — bottle inside nap snaps to closer edge (no putdown extension)", () => {
  it("placeholder bottle landing in nap_1 snaps to whichever nap edge is closer; chain follows", () => {
    // Setup:
    //   wake 7:00, buffer 10, interval 180, bottlesPerDay 4, now 8:00
    //   recorded nap_1 from 9:30-11:00.
    //
    // The no-feed region is `[nap.start, nap.end]` ONLY — putdownLead
    // does NOT extend it (DOMAIN.md §4). Region = [9:30, 11:00].
    //
    // Sequential cascade:
    //   bottle_1 = 7:10 (wake+buffer anchor)
    //   bottle_2 proposed = 7:10 + 180 = 10:10. Inside (9:30, 11:00).
    //     distBefore (10:10 → 9:30) = 40
    //     distAfter (11:00 → 10:10) = 50
    //     → snap to 9:30. nowMinutes 8:00 < 9:30, no past-fallback.
    //   bottle_3 proposed = 9:30 + 180 = 12:30. Projected nap_2 at
    //     [12:30, 13:30] (wakeWindowsMinutes[1]=90 after nap_1.end 11:00,
    //     default napLen 60). 12:30 == nap.start, NOT strictly inside.
    //     bottle_3 stays at 12:30.
    //   bottle_4 proposed = 12:30 + 180 = 15:30. Projected nap_3 at
    //     [15:00, 16:00]. 15:30 strictly inside. dist tie (30/30) →
    //     snap to start (15:00). nowMinutes 8:00 < 15:00, no fallback.
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

    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // 7:10 (anchor)
      9 * 60 + 30, // 9:30 (snapped to nap_1.start)
      12 * 60 + 30, // 12:30 (== nap_2.start, NOT strictly inside)
      15 * 60, // 15:00 (snapped to nap_3.start)
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

// ---------------------------------------------------------------------------
// R5.x — Amount-conditional cascade interval (restored from V2)
// ---------------------------------------------------------------------------

describe("R5.1 — cascade interval honors bottleIntervalRules", () => {
  it("a 4oz recording (within 0-5oz rule = 120m) projects next bottle 120m later, not the default 180m", () => {
    const recorded = aRecordedBottle({
      id: "actual_bottle_small",
      eventKey: "bottle_1",
      start: 8 * 60,
      amountOz: 4,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 2, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        bottleIntervalRules: [
          { minOz: 0, maxOz: 5, intervalMinutes: 120 },
          { minOz: 5.1, intervalMinutes: 180 },
        ],
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

    // After step 1 (uses recorded amountOz=4 → 120m), subsequent
    // projections carry defaultBottleAmountOz=5 (factory default,
    // matches 0-5oz rule → 120m). Cascade extends to midnight.
    //   8:00 (rec, 4oz), 10:00 (proj, 5oz default), 12:00, 14:00, …
    //   each step +120m. Stops before midnight: 22:00, 24:00 ≥ 1440 → stop.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60, // 8:00 recorded (4oz)
      10 * 60, // 8:00 + 120 (last-recorded 4oz → 0-5oz rule)
      12 * 60, // 10:00 + 120 (default 5oz → 0-5oz rule)
      14 * 60,
      16 * 60,
      18 * 60,
      20 * 60,
      22 * 60,
      // next would be 24:00 ≥ 1440 → stop
    ]);
  });

  it("a 6oz recording falls back to default when no rule matches", () => {
    const recorded = aRecordedBottle({
      id: "actual_bottle_big",
      eventKey: "bottle_1",
      start: 8 * 60,
      amountOz: 6,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 2, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        bottleIntervalRules: [{ minOz: 0, maxOz: 5, intervalMinutes: 120 }],
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

    // Step 1: 6oz recording, no rule match → default 180m.
    // Steps 2..N: projections carry defaultBottleAmountOz=5, which
    // matches the 0-5oz rule (inclusive boundary) → 120m.
    // Cascade extends to midnight.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60, // 8:00 recorded (6oz)
      11 * 60, // 8:00 + 180 (no rule for 6oz → default)
      13 * 60, // 11:00 + 120 (5oz default matches 0-5oz rule)
      15 * 60,
      17 * 60,
      19 * 60,
      21 * 60,
      23 * 60,
      // next would be 25:00 ≥ 1440 → stop
    ]);
  });

  it("step 1 uses LAST RECORDED amount; steps 2..N use defaultBottleAmountOz (predict-don't-prescribe)", () => {
    // Locked architectural decision (2026-05-11): only the immediately-next
    // projection inherits the most recent recording's amount. Subsequent
    // projections use `defaultBottleAmountOz` because that field IS the
    // best-guess for future bottle size — adapting *every* projection to
    // match the last recorded would be prescribing what the baby will eat,
    // not predicting.
    const recorded = aRecordedBottle({
      id: "actual_bottle_big",
      eventKey: "bottle_1",
      start: 7 * 60,
      amountOz: 7, // matches the 6+oz rule below → 240m for ONE step
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleAmountOz: 5,
        defaultBottleIntervalMinutes: 999, // never used; would fail loudly
        bottleIntervalRules: [
          { minOz: 0, maxOz: 5, intervalMinutes: 120 }, // 5oz default → 120m
          { minOz: 6, intervalMinutes: 240 }, // 7oz recorded → 240m
        ],
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

    // Step 1 uses recorded 7oz → 240m (matches 6+oz rule).
    // Steps 2..N use projections' 5oz default → 120m (0-5oz rule).
    // Cascade extends to midnight at the 120m cadence.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60, // 7:00 recorded (7oz)
      11 * 60, // 7:00 + 240 (7oz rule)
      13 * 60, // 11:00 + 120 (default 5oz)
      15 * 60,
      17 * 60,
      19 * 60,
      21 * 60,
      23 * 60,
      // next would be 25:00 ≥ 1440 → stop
    ]);
  });

  it("empty bottleIntervalRules → falls back to default for every step (unchanged behavior)", () => {
    // Regression guard: existing tests use bottleIntervalRules: [] (via aSettings default)
    // and must continue passing.
    const recorded = aRecordedBottle({
      id: "actual_bottle_1",
      eventKey: "bottle_1",
      start: 8 * 60 + 30,
      amountOz: 5,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 2, bufferAfterWakeMinutes: 10 },
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

    // 1 recorded + cascade forward at default 180m to midnight.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60 + 30, // 8:30 recorded
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
      20 * 60 + 30,
      23 * 60 + 30,
      // next would be 26:30 ≥ 1440 → stop
    ]);
  });
});

// ---------------------------------------------------------------------------
// R5.1 / R5.11 — overridden bottles anchor the cascade
// ---------------------------------------------------------------------------
//
// Click-test bug (Jake, 2026-05-12): tapping a projected bottle in the
// drawer and assigning an "other" owner produces an `overridden` doc
// (formToEvent: projected + no time change → overridden, preserving the
// predicted slot as scheduling intent). The engine then stopped cascading:
//   - R5.11 saw the overridden bottle exist → did NOT fire (gated on
//     `!events.some(isBottle)`).
//   - R5.1 saw the overridden bottle but it isn't `isRecordedEvent` →
//     did NOT fire (gated on `bottles.some(isRecordedEvent)`).
// Result: the engine output only the single overridden bottle, no
// downstream projections.
//
// Predict-don't-prescribe: the user's owner assignment IS a commitment
// to that slot — the engine should treat overridden bottles like other
// non-projected bottles for cascade-anchoring purposes (same as
// recorded). Only `projected` is "the engine made this up."
describe("R5.1 — overridden bottles anchor the cascade", () => {
  it("with one overridden bottle at 8:30, projects the remaining bottles_per_day at interval", () => {
    const overridden: Event = aProjectedBottle({
      id: "manual_bottle_1",
      eventKey: "bottle_1",
      start: 8 * 60 + 30,
      lifecycle: { state: "overridden", annotatedAt: 8 * 60 + 30 },
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
      }),
      actuals: [overridden],
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

    // Same cascade as the recorded case: anchor + forward to midnight.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60 + 30,
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
      20 * 60 + 30,
      23 * 60 + 30,
    ]);
    // Overridden anchor preserved (§0 reality-wins extended to user
    // commitment).
    expect(bottles[0]?.id).toBe(overridden.id);
    expect(bottles[0]?.lifecycle.state).toBe("overridden");
    expect(bottles.slice(1).every((b) => b.lifecycle.state === "projected")).toBe(true);
  });

  it("R5.8 + backfill together fill the morning when overridden anchor is late-day", () => {
    // Mirrors Jake's 2026-05-12 screenshot: overridden bottle at 19:10
    // (post-bedtime threshold), bottlesPerDay=5, defaultWakeTime=7:00.
    //
    // With bidirectional sequential cascade + midnight rule (cascade
    // caps at 1440, not tomorrowWake), and bottlesPerDay treated as
    // cold-start target only:
    //
    //   Backfill from 19:10 (anchor) — runs until wake+buffer:
    //     19:10 - 180 = 16:10 ✓ → push
    //     16:10 - 180 = 13:10 ✓ → push
    //     13:10 - 180 = 10:10 ✓ → push
    //     10:10 - 180 = 7:10 (== wake+buffer 7:10) ✓ → push
    //     7:10 - 180 = 4:10 (< 7:10) → stop
    //   Forward from 19:10 — runs until midnight:
    //     19:10 + 180 = 22:10 ✓ → push
    //     22:10 + 180 = 25:10 (≥ 1440) → stop
    //
    // Result: [7:10, 10:10, 13:10, 16:10, 19:10, 22:10] — 6 bottles.
    // Predict-don't-prescribe: even though anchor + backfill gave 5
    // and that equals bottlesPerDay, the engine still predicts the
    // 22:10 evening bottle because the cascade follows cadence, not
    // count, in the anchored case.
    const overridden: Event = aProjectedBottle({
      id: "manual_bottle_1",
      eventKey: "bottle_1",
      start: 19 * 60 + 10,
      lifecycle: { state: "overridden", annotatedAt: 19 * 60 + 10 },
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [overridden],
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

    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10,
      10 * 60 + 10,
      13 * 60 + 10,
      16 * 60 + 10,
      19 * 60 + 10,
      22 * 60 + 10,
    ]);
    // Each slot is distinct — the screenshot symptom (3 bottles at 19:10)
    // would fail this assertion.
    const uniqueStarts = new Set(bottles.map((b) => b.startTime));
    expect(uniqueStarts.size).toBe(bottles.length);
    // Anchor preserved.
    const anchor = bottles.find((b) => b.id === overridden.id);
    expect(anchor?.lifecycle.state).toBe("overridden");
  });

  it("with both an overridden AND a recorded bottle, cascade anchors from the LATER one", () => {
    // Reality-wins still applies: the latest non-projected bottle (by
    // startTime) is the anchor, regardless of which lifecycle state it's
    // in. A recorded bottle at 10:00 and an overridden bottle at 13:00
    // → cascade resumes from 13:00.
    const recorded = aRecordedBottle({
      id: "actual_bottle_1",
      eventKey: "bottle_1",
      start: 10 * 60,
      amountOz: 5,
    });
    const overridden: Event = aProjectedBottle({
      id: "manual_bottle_2",
      eventKey: "bottle_2",
      start: 13 * 60,
      lifecycle: { state: "overridden", annotatedAt: 13 * 60 },
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
      }),
      actuals: [recorded, overridden],
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

    // Anchored cascade extends to midnight:
    //   10:00 (recorded), 13:00 (overridden) — anchors.
    //   Backfill from earliest (10:00): 10:00 - 180 = 7:00 < 7:10 → stop.
    //   Forward from latest (13:00): 16:00, 19:00, 22:00, then 25:00 ≥ 1440 → stop.
    expect(bottles.map((b) => b.startTime)).toEqual([10 * 60, 13 * 60, 16 * 60, 19 * 60, 22 * 60]);
  });
});

// ---------------------------------------------------------------------------
// Sequential bottle cascade (replaces R5.1 + R5.6 + R5.7 + R5.11)
// ---------------------------------------------------------------------------
//
// Predict-don't-prescribe (DOMAIN.md §2 + §7): each bottle's time is
// computed from the PREVIOUS bottle's actual rendered time, not from a
// grid-then-nudge two-pass system. The chain stays coherent through
// nap-overlap snaps.
//
// Also per DOMAIN.md §4 / SIMPLIFICATION_SCOPE.md §2.1:
//   - No-feed region is `[nap.start, nap.end]` only — wind-down (putdown)
//     is render-only synthetic. A bottle CAN land during wind-down.
//   - Cascade stops at midnight (1440), not tomorrowWake (the "midnight
//     rule" — DOMAIN.md §2).
//   - Overnight bottles (startTime < wakeTime) do NOT anchor the cascade;
//     they tally toward bottlesPerDay but the cascade still anchors at
//     wake+buffer.

describe("Sequential bottle cascade — chain coherence", () => {
  it("bottle_3's time is computed from bottle_2's SNAPPED time, not from a grid", () => {
    // Setup: wake 7:00, buffer 10, interval 180, bottlesPerDay 5.
    // Recorded nap_1 9:30-11:00 (gives R5.6-style snap a target).
    // Long wakeWindowsMinutes so projected naps land after the chain
    // (keeps the test focused on the bottle cascade).
    //
    // OLD behavior (grid-then-nudge):
    //   R5.11 places: 7:10, 10:10, 13:10, 16:10, 19:10
    //   R5.6 (with putdownLead 15) sees bottle_2 (10:10) in
    //     [9:15, 11:00]. Snap to 11:00 (closer once putdown extends
    //     region). bottle_3 at 13:10 is outside any region → stays.
    //   Result: [7:10, 11:00, 13:10, 16:10, 19:10]
    //
    // NEW behavior (sequential cascade, snap region = [nap.start, nap.end]):
    //   bottle_1 = 7:10 (anchor at wake+buffer)
    //   bottle_2 proposed = 7:10 + 180 = 10:10. Inside [9:30, 11:00].
    //     |10:10 - 9:30| = 40, |11:00 - 10:10| = 50 → snap to 9:30.
    //     (Wind-down at 9:15-9:30 is allowed; only the nap proper blocks.)
    //   bottle_3 proposed = 9:30 + 180 = 12:30  ← CHAIN COHERENCE
    //   bottle_4 proposed = 12:30 + 180 = 15:30
    //   bottle_5 proposed = 15:30 + 180 = 18:30
    //   Result: [7:10, 9:30, 12:30, 15:30, 18:30]
    const recordedNap1 = aRecordedNap({
      id: "actual_nap_1",
      eventKey: "nap_1",
      start: 9 * 60 + 30,
      end: 11 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        // Long wake windows: nap_2 from R3.1 projection won't interfere.
        wakeWindowsMinutes: [120, 600, 600, 600],
      }),
      actuals: [recordedNap1],
      // Set nowMinutes before 9:30 so the past-edge fallback doesn't
      // flip the snap to nap.end.
      nowMinutes: 7 * 60 + 30,
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

    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // 7:10 (anchor)
      9 * 60 + 30, // 9:30 (snapped to nap.start — wind-down allowed)
      12 * 60 + 30, // 12:30 (cascade from 9:30, NOT 10:10)
      15 * 60 + 30, // 15:30
      18 * 60 + 30, // 18:30
    ]);
  });

  it("bottle landing exactly at nap.start is allowed (bottle IS the wind-down)", () => {
    // Configure so the grid would place a bottle exactly at nap.start.
    // wake 7:00, buffer 0, interval 60. bottlesPerDay 3.
    // Recorded nap_1 8:00-9:00. Grid: 7:00, 8:00, 9:00.
    //   bottle_2 proposed = 8:00 = nap.start exactly. Old rule treats
    //   this as STRICTLY inside via "> nap.start && < nap.end"; not
    //   inside. New rule: same — > start, < end. So 8:00 stays as-is.
    const recordedNap1 = aRecordedNap({
      id: "actual_nap_1",
      eventKey: "nap_1",
      start: 8 * 60,
      end: 9 * 60,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 3, bufferAfterWakeMinutes: 0 },
        defaultBottleIntervalMinutes: 60,
        wakeWindowsMinutes: [600, 600, 600, 600],
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
      { rules: ALL },
    );
    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);
    // bottle at exact nap.start (8:00) is NOT inside (start, end) — kept.
    // bottle_3 = 8:00 + 60 = 9:00 = nap.end — also boundary, kept.
    expect(bottles.map((b) => b.startTime)).toEqual([7 * 60, 8 * 60, 9 * 60]);
  });
});

describe("Sequential bottle cascade — midnight rule (DOMAIN.md §2)", () => {
  it("cascade stops at midnight (1440), not at tomorrowWake", () => {
    // bottlesPerDay 10 with intervals of 180 from wake 7:00:
    // grid would be 7:10, 10:10, 13:10, 16:10, 19:10, 22:10, 1:10, ...
    // Old rule capped at tomorrowWake (= 31:00 = 1860); would emit 8.
    // New rule caps at midnight (1440); emits 6 (last at 22:10 = 1330,
    // next would be 25:10 = 1510 >= 1440 → stop).
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 10, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        defaultWakeTime: 7 * 60,
        wakeWindowsMinutes: [600, 600, 600, 600],
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
    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10,
      10 * 60 + 10,
      13 * 60 + 10,
      16 * 60 + 10,
      19 * 60 + 10,
      22 * 60 + 10,
    ]);
    // Last is well under midnight; next would be 25:10 = 1510 >= 1440.
    expect(bottles[bottles.length - 1]!.startTime).toBeLessThan(24 * 60);
  });

  it("overnight bottle (startTime < wakeTime) does NOT anchor the cascade", () => {
    // A recorded bottle at 2 AM (TimeMin=120, less than wakeTime 7:00=420).
    // Per midnight rule: this bottle is part of today's day but does
    // NOT anchor the cascade. Morning cascade still anchors at
    // wake+buffer = 7:10.
    const overnight = aRecordedBottle({
      id: "actual_bottle_overnight",
      eventKey: "bottle_overnight",
      start: 2 * 60,
      amountOz: 4,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [600, 600, 600, 600],
      }),
      actuals: [overnight],
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
    // Overnight bottle present, but morning cascade starts at 7:10 anyway.
    // 5 bottles total (overnight counts toward bottlesPerDay):
    //   2:00 (overnight, recorded)
    //   7:10 (wake+buffer anchor)
    //   10:10, 13:10, 16:10 (cascade — 4 more to reach 5 total)
    expect(bottles.map((b) => b.startTime)).toEqual([
      2 * 60,
      7 * 60 + 10,
      10 * 60 + 10,
      13 * 60 + 10,
      16 * 60 + 10,
    ]);
    // The overnight bottle is preserved as-recorded.
    expect(bottles[0]?.id).toBe(overnight.id);
  });
});

describe("Sequential bottle cascade — backward backfill (§F19b / §F21)", () => {
  it("when the only non-projected bottle is mid-day, backfill morning slots", () => {
    // User recorded bottle_X at 13:00 (mid-day). bottlesPerDay 4
    // (cold-start target only; anchored cascade runs to midnight).
    // Wake 7:00, buffer 10, interval 180.
    //
    // Backfill from 13:00 (walks backward to wake+buffer):
    //   13:00 - 180 = 10:00 ✓ → push
    //   10:00 - 180 = 7:00 (< 7:10) → stop
    // Forward from 13:00 (walks to midnight):
    //   13:00 + 180 = 16:00 → push
    //   16:00 + 180 = 19:00 → push
    //   19:00 + 180 = 22:00 → push
    //   22:00 + 180 = 25:00 (≥ 1440) → stop
    //
    // Total: [10:00, 13:00 (anchor), 16:00, 19:00, 22:00] — 5 bottles.
    const recorded = aRecordedBottle({
      id: "actual_bottle_midday",
      eventKey: "bottle_midday",
      start: 13 * 60,
      amountOz: 5,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [600, 600, 600, 600],
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
    expect(bottles.map((b) => b.startTime)).toEqual([
      10 * 60, // backfill
      13 * 60, // anchor
      16 * 60, // forward
      19 * 60, // forward
      22 * 60, // forward (extends past bottlesPerDay)
    ]);
    // The recorded anchor is preserved.
    const recordedOut = bottles.find((b) => b.id === recorded.id);
    expect(recordedOut?.lifecycle.state).toBe("completed");
  });
});

describe("Sequential bottle cascade — bottlesPerDay is a cold-start target, not a hard cap", () => {
  it("when recordings already meet bottlesPerDay, cascade still projects forward (predict-don't-prescribe)", () => {
    // Jake's 2026-05-13 sick-baby scenario:
    //   Default wake 7am. bottlesPerDay=5.
    //   Recorded: 4am 3oz (overnight), 6am 3.75oz (overnight),
    //             8:32am 3oz, 11:14am 1oz, 12:12pm 1.5oz.
    //   All five count toward bottlesPerDay → old engine: nothing more
    //   projected; rest of day is blank.
    //
    // New semantics (DOMAIN.md §2 predict-don't-prescribe):
    //   bottlesPerDay is the COLD-START target — it controls how many
    //   placeholders to draw when no recordings exist yet. Once any
    //   non-projected morning bottle exists, the cascade follows
    //   cadence: forward from the latest morning anchor to midnight,
    //   backward from the earliest to wake+buffer. No total-count cap.
    //
    // Expected:
    //   - 2 overnight recordings preserved (4am, 6am) — don't anchor
    //     but tally.
    //   - 3 morning anchors preserved (8:32, 11:14, 12:12).
    //   - Forward cascade from 12:12pm continues at intervalForAmount
    //     until midnight.
    //   - With defaultBottleIntervalMinutes=180 and projections
    //     carrying defaultBottleAmountOz=5, cascade gives:
    //       12:12 + 180 = 15:12
    //       15:12 + 180 = 18:12
    //       18:12 + 180 = 21:12
    //       21:12 + 180 = 24:12 (1452) ≥ 1440 → STOP
    //     3 more projections.
    //   - Total: 5 recordings + 3 projections = 8 bottles. NOT capped
    //     at bottlesPerDay=5.
    const overnight1 = aRecordedBottle({
      id: "rec_4am",
      eventKey: "bottle_overnight_1",
      start: 4 * 60,
      amountOz: 3,
    });
    const overnight2 = aRecordedBottle({
      id: "rec_6am",
      eventKey: "bottle_overnight_2",
      start: 6 * 60,
      amountOz: 3.75,
    });
    const morning1 = aRecordedBottle({
      id: "rec_832am",
      eventKey: "bottle_1",
      start: 8 * 60 + 32,
      amountOz: 3,
    });
    const morning2 = aRecordedBottle({
      id: "rec_1114am",
      eventKey: "bottle_2",
      start: 11 * 60 + 14,
      amountOz: 1,
    });
    const morning3 = aRecordedBottle({
      id: "rec_1212pm",
      eventKey: "bottle_3",
      start: 12 * 60 + 12,
      amountOz: 1.5,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [600, 600, 600, 600],
      }),
      actuals: [overnight1, overnight2, morning1, morning2, morning3],
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

    expect(bottles.map((b) => b.startTime)).toEqual([
      4 * 60, // overnight (recorded, doesn't anchor)
      6 * 60, // overnight (recorded, doesn't anchor)
      8 * 60 + 32, // recorded
      11 * 60 + 14, // recorded
      12 * 60 + 12, // recorded (latest morning anchor)
      15 * 60 + 12, // cascade: 12:12 + 180
      18 * 60 + 12, // cascade: 15:12 + 180
      21 * 60 + 12, // cascade: 18:12 + 180
    ]);
    expect(bottles).toHaveLength(8);
    // Recordings preserved.
    for (const rec of [overnight1, overnight2, morning1, morning2, morning3]) {
      const out = bottles.find((b) => b.id === rec.id);
      expect(out?.lifecycle.state).toBe("completed");
    }
  });

  it("cold-start still caps at bottlesPerDay (no anchors → bottlesPerDay placeholders)", () => {
    // Regression guard: the relaxation above only applies when there
    // are non-projected morning anchors. With zero anchors, the cold-
    // start cascade still produces exactly bottlesPerDay placeholders
    // (or fewer if midnight cap intervenes).
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [600, 600, 600, 600],
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

    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);
    expect(bottles).toHaveLength(5);
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10,
      10 * 60 + 10,
      13 * 60 + 10,
      16 * 60 + 10,
      19 * 60 + 10,
    ]);
  });
});

describe("Sequential bottle cascade — caps forward at bedtime (DOMAIN.md §1 + §3)", () => {
  it("cold-start cascade stops at projected bedtime, not at midnight", () => {
    // Setup: wake 7:00, buffer 10, default interval 180, bottlesPerDay 10.
    // bedtimeThreshold = 19:00 → R7.6 substitutes the nap at/past 19:00
    // with a bedtime event.
    //
    // Without bedtime cap, cold-start cascade would produce 6 bottles
    // up to midnight: 7:10, 10:10, 13:10, 16:10, 19:10, 22:10 (next
    // would be 25:10 ≥ 1440). WITH bedtime cap, the 19:10 and 22:10
    // slots are past bedtime → NOT projected.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 10, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        defaultWakeTime: 7 * 60,
        bedtimeThreshold: 19 * 60,
        wakeWindowsMinutes: [120, 135, 135, 150],
      }),
      actuals: [],
      nowMinutes: 6 * 60,
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_WITH_BEDTIME },
    );

    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);

    expect(bottles.length).toBeGreaterThan(0);
    // No bottle at or past bedtime (19:00).
    for (const b of bottles) {
      expect(b.startTime).toBeLessThan(19 * 60);
    }
    // Bedtime event projected.
    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime?.startTime).toBe(19 * 60);
  });

  it("recorded bottle past bedtime is preserved but does NOT cascade forward from there", () => {
    // Dream-feed-like scenario: user records a 21:00 bottle (past
    // bedtime 19:00). Recording stays (reality wins). Forward cascade
    // anchors on the latest IN-CHAIN bottle (pre-bedtime), NOT on the
    // post-bedtime recording — the engine doesn't predict 24:00 / 3:00
    // / 6:00 overnight feeds.
    const dreamFeed = aRecordedBottle({
      id: "rec_dream",
      eventKey: "bottle_dream",
      start: 21 * 60,
      amountOz: 4,
    });
    const recordedMorning = aRecordedBottle({
      id: "rec_morning",
      eventKey: "bottle_1",
      start: 16 * 60,
      amountOz: 5,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        defaultWakeTime: 7 * 60,
        bedtimeThreshold: 19 * 60,
        wakeWindowsMinutes: [120, 135, 135, 150],
      }),
      actuals: [recordedMorning, dreamFeed],
      nowMinutes: 22 * 60,
    });

    const out = projectDay(
      {
        day: ctx.day,
        settings: ctx.settings,
        actuals: ctx.actuals,
        nowMinutes: ctx.nowMinutes,
      },
      { rules: ALL_WITH_BEDTIME },
    );

    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);

    // Both recordings preserved.
    expect(bottles.find((b) => b.id === recordedMorning.id)).toBeDefined();
    expect(bottles.find((b) => b.id === dreamFeed.id)).toBeDefined();
    // No PROJECTED bottle at/past 19:00 (bedtime cap).
    const projectedPastBedtime = bottles.filter(
      (b) => b.lifecycle.state === "projected" && b.startTime >= 19 * 60,
    );
    expect(projectedPastBedtime).toEqual([]);
  });
});
