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

describe("R5.6 — projected bottle in the putdown wind-down moves to BEFORE the wind-down", () => {
  it("a projected bottle landing 5 min before nap.start (inside the putdown lead) is pushed to nap.start - putdownLead", () => {
    // putdownLeadMinutes = 15 (default). nap_1 starts at 10:00, so the
    // wind-down region is [9:45, 10:00]. A projected bottle at 9:55
    // sits inside the wind-down: it should move to 9:45, not stay at
    // 9:55, and not snap to 10:00 (which is the nap's actual start).
    const recordedNap1 = aRecordedNap({
      id: "actual_nap_putdown",
      eventKey: "nap_1",
      start: 10 * 60,
      end: 11 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 + 5 }),
      settings: aSettings({
        // bottlesPerDay=2 with first at 7:15, second predicted 10:15.
        // 10:15 lands inside recorded nap_1 [10:00, 11:00] → R5.6 fires.
        // With putdown buffer the "no-go" region is [9:45, 11:00];
        // predicted 10:15 closer to 11:00 (45) vs 9:45 (30) → 9:45 wins.
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
    // Second projected bottle should land at the START of the putdown
    // wind-down (9:45), not at nap.start (10:00) and not staying at 10:15.
    expect(bottles[bottles.length - 1]!.startTime).toBe(9 * 60 + 45);
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

describe("R5.6 — projected bottle inside a nap moves to the closer edge (with putdown buffer)", () => {
  it("placeholder bottle landing in nap_1 moves to whichever edge of the [putdown..nap.end] region is closer", () => {
    // Setup:
    //   wake 7:00, buffer 10, interval 180, bottlesPerDay 4, now 8:00
    //   recorded nap_1 from 9:30-11:00, putdownLead 15 (default)
    //
    // R5.6 treats each nap's "no-go" region as
    //   [nap.start - putdownLead, nap.end]
    // because the putdown wind-down is also no-bottle territory. So
    // nap_1's region is [9:15, 11:00], not [9:30, 11:00].
    //
    // R5.11 places placeholders at 7:10, 10:10, 13:10, 16:10.
    // bottle_2 at 10:10 is inside [9:15, 11:00].
    //   predicted (prev 7:10 + 180) = 10:10
    //   region.start = 9:15, distance |10:10 - 9:15| = 55
    //   region.end   = 11:00, distance |11:00 - 10:10| = 50
    //   → move to 11:00 (after-edge closer once the wind-down extends the region).
    //
    // Cascade then projects nap_2 at [12:30, 13:30]; with putdown the
    // region is [12:15, 13:30]. bottle_3 at 13:10 is inside; predicted
    // from new bottle_2 (11:00) + 180 = 14:00, after-edge wins → 13:30.
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

    // With putdown-buffered regions, bottle_2 → 11:00 (nap_1 after-edge),
    // bottle_3 → 13:30 (nap_2 after-edge), bottle_4 stays at 16:10
    // (outside nap_3's [14:45, 16:00] region).
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // 7:10
      11 * 60, // 11:00 (after recorded nap_1)
      13 * 60 + 30, // 13:30 (after projected nap_2)
      16 * 60 + 10, // 16:10
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

    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60, // 8:00 recorded (4oz)
      10 * 60, // 10:00 = 8:00 + 120m (matched 0-5oz rule)
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

    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60, // 8:00 recorded (6oz, no matching rule)
      11 * 60, // 8:00 + default 180m
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

    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60, // 7:00 recorded (7oz)
      11 * 60, // 7:00 + 240m (7oz rule applies — last recorded)
      13 * 60, // 11:00 + 120m (5oz default — projection carries default)
      15 * 60, // 13:00 + 120m (5oz default continues)
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

    expect(bottles.map((b) => b.startTime)).toEqual([8 * 60 + 30, 11 * 60 + 30]);
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

    // Same cascade as the recorded case: 4 bottles total.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60 + 30,
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
    ]);
    // Overridden anchor preserved (§0 reality-wins extended to user
    // commitment).
    expect(bottles[0]?.id).toBe(overridden.id);
    expect(bottles[0]?.lifecycle.state).toBe("overridden");
    expect(bottles.slice(1).every((b) => b.lifecycle.state === "projected")).toBe(true);
  });
});
