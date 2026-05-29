/** R5.x — Bottle rules. */

import { describe, expect, it } from "vitest";
import type { Event } from "../../schemas";
import {
  aContext,
  aDay,
  aProjectedBottle,
  aRecordedBedtime,
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
// ALL_WITH_BEDTIME: alias for tests depending on the sleep cascade's bedtime emission.
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

    // ADR-0006: nowMinutes=12:00; bottles at 7:10, 10:10 auto-promote to recorded; 13:10, 16:10 stay projected.
    expect(
      bottles.every((b) =>
        b.startTime <= ctx.nowMinutes
          ? b.lifecycle.state === "recorded"
          : b.lifecycle.state === "projected",
      ),
    ).toBe(true);
    expect(bottles.every((b) => b.kind === "instant")).toBe(true);
  });
});

describe("R5.8 — cascade stops at midnight (the 'midnight rule', DOMAIN.md §2)", () => {
  it("bottlesPerDay=20 caps at the last slot before midnight (1440)", () => {
    // Recorded bottle_1 at 7:30, interval 180: slots at 7:30, 10:30, 13:30, 16:30, 19:30, 22:30;
    // next would be 25:30 ≥ 1440 → stop. 6 bottles total.
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
    expect(bottles[bottles.length - 1]!.startTime).toBe(22 * 60 + 30);
    expect(bottles.every((b) => b.startTime < 24 * 60)).toBe(true);
  });
});

describe("R5.4 — labels renumber chronologically (all bottles); recorded eventKeys frozen", () => {
  it("recorded bottles with non-chronological eventKeys get chronological LABELS; eventKeys stay frozen", () => {
    // FAB-inserted bottle at 7:30 carries eventKey 'bottle_2' (later slot); the
    // earlier-logged bottle at 9:00 carries 'bottle_1'. Display labels follow
    // clock order; the persisted eventKeys do not change (EC-B4).
    const lateInserted = aRecordedBottle({
      id: "b_late_insert",
      eventKey: "bottle_2",
      label: "Bottle 2",
      start: 7 * 60 + 30,
    });
    const firstLogged = aRecordedBottle({
      id: "b_first_logged",
      eventKey: "bottle_1",
      label: "Bottle 1",
      start: 9 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 2, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
      }),
      actuals: [lateInserted, firstLogged],
      nowMinutes: 10 * 60, // before cascade-natural emit to avoid auto-promote interference
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

    // eventKeys frozen: 7:30 stays bottle_2, 9:00 stays bottle_1.
    expect(bottles[0]!.id).toBe("b_late_insert"); // 7:30 one
    expect(bottles[0]!.eventKey).toBe("bottle_2");
    expect(bottles[1]!.id).toBe("b_first_logged"); // 9:00 one
    expect(bottles[1]!.eventKey).toBe("bottle_1");
    // Labels are chronological for ALL bottles: 7:30 → "Bottle 1", 9:00 → "Bottle 2", …
    bottles.forEach((b, i) => expect(b.label).toBe(`Bottle ${i + 1}`));
    // Projected bottles still fill eventKeys from max(recorded)+1 = bottle_3 onward.
    const projected = bottles.filter((b) => b.lifecycle.state === "projected");
    expect(projected.length).toBeGreaterThan(0);
    expect(projected[0]!.eventKey).toBe("bottle_3");
  });

  it("a time-edited recorded bottle keeps its eventKey but its label tracks its new position", () => {
    const recorded = aRecordedBottle({
      id: "b_recorded",
      eventKey: "bottle_3",
      label: "Bottle 3",
      start: 12 * 60 + 30, // moved from 13:10 → 12:30
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
      }),
      actuals: [recorded],
      nowMinutes: 13 * 60,
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
    const rec = bottles.find((b) => b.id === "b_recorded")!;
    expect(rec.eventKey).toBe("bottle_3"); // frozen Firestore identity
    // Label = the recorded bottle's chronological rank among all bottles.
    expect(rec.label).toBe(`Bottle ${bottles.indexOf(rec) + 1}`);
    // Every bottle's label matches its chronological position (EC-B3 invariant).
    bottles.forEach((b, i) => expect(b.label).toBe(`Bottle ${i + 1}`));
    // Subsequent projected bottles still start at bottle_4 (max recorded + 1).
    const projected = bottles.filter((b) => b.lifecycle.state === "projected");
    expect(projected.length).toBeGreaterThan(0);
    expect(projected[0]!.eventKey).toBe("bottle_4");
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

    // Recorded at 8:30 + cascade at 180min to midnight: 11:30, 14:30, 17:30, 20:30, 23:30.
    // bottlesPerDay=4 is the cold-start target, not a hard cap.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60 + 30,
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
      20 * 60 + 30,
      23 * 60 + 30,
    ]);

    const first = bottles[0]!;
    expect(first.id).toBe(recorded.id);
    expect(first.lifecycle.state).toBe("completed");

    // ADR-0006: past-now projections auto-promote to recorded.
    const projections = bottles.slice(1);
    expect(
      projections.every((b) =>
        b.startTime <= ctx.nowMinutes
          ? b.lifecycle.state === "recorded"
          : b.lifecycle.state === "projected",
      ),
    ).toBe(true);
    expect(projections.every((b) => b.kind === "instant")).toBe(true);
  });
});

describe("Sequential cascade — bottle landing in nap snaps to putdown.startTime (PR 3c)", () => {
  it("a projected bottle landing inside nap_1 snaps to nap.start - putdownLead (the start of putdown)", () => {
    // bottle_2 proposed at 10:15, inside nap_1 [10:00, 11:00]:
    // snapOutOfNap → 10:00; snapToPutdown [9:45, 10:30] → 9:45. bottle_2 = 9:45.
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
    // Snapped to putdown start (nap.start - lead = 9:45), not nap.start (10:00).
    expect(bottles[bottles.length - 1]!.startTime).toBe(9 * 60 + 45);
  });
});

describe("R5.6 — convergence regression with various nowMinutes", () => {
  // Representative pre-wake case; broader convergence coverage is in properties.test.ts.
  it("converges and produces bottles when nowMinutes is before wake", () => {
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
      nowMinutes: 0,
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
    expect(bottles.length).toBeGreaterThan(0);
    expect(bottles[0]!.startTime).toBeLessThanOrEqual(8 * 60 + 15);
    // No bottle strictly inside the recorded nap (10:16–12:14).
    for (const b of bottles) {
      const insideNap = b.startTime > 10 * 60 + 16 && b.startTime < 12 * 60 + 14;
      expect(insideNap).toBe(false);
    }
  });
});

describe("R5.6 — convergence regression (mirrors property-test failure)", () => {
  it("converges with recorded bottle at 8:15 + recorded nap 10:16-12:14 + early wake", () => {
    // Property-test convergence failure: bottle_2 lands inside recorded nap; must not loop.
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

describe("Sequential cascade — snap-out-of-nap + putdown-anchor (PR 3c)", () => {
  it("placeholder bottle landing in nap_1 snaps to nearer edge then putdown-anchor pulls subsequent bottles to putdown.startTime", () => {
    // wake 7:00, buffer 10, interval 180, recorded nap_1 9:30-11:00 (napLen=90).
    // bottle_2 at 10:10 → snapOutOfNap → 9:30 → snapToPutdown [9:15, 10:15] → 9:15.
    // bottle_3 = 9:15+180 = 12:15 → putdown-anchor nap_2 → stays 12:15.
    // bottle_4 = 12:15+180 = 15:15 → inside nap_3 [15:00, 16:00] → snapOutOfNap → 15:00 → putdown → 14:45.
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
      7 * 60 + 10, // anchor
      9 * 60 + 15, // snapOutOfNap → 9:30, putdown-anchor → 9:15
      12 * 60 + 15, // putdown-anchor: nap_2.start 12:30 − 15
      14 * 60 + 45, // snapOutOfNap → 15:00, putdown-anchor → 14:45
    ]);

    // No bottle strictly inside any nap.
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
// R5.x — Amount-conditional cascade interval
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

    // Step 1: 4oz recorded → 120m. Steps 2+: default 5oz → 0-5oz rule → 120m. Last slot 22:00.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60, // recorded (4oz)
      10 * 60, // 8:00 + 120m
      12 * 60,
      14 * 60,
      16 * 60,
      18 * 60,
      20 * 60,
      22 * 60, // next would be 24:00 ≥ 1440 → stop
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

    // Step 1: 6oz → no rule match → default 180m. Steps 2+: 5oz default → 0-5oz rule → 120m.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60, // recorded (6oz)
      11 * 60, // 8:00 + 180m (no rule match)
      13 * 60, // 11:00 + 120m (default 5oz)
      15 * 60,
      17 * 60,
      19 * 60,
      21 * 60,
      23 * 60, // next would be 25:00 ≥ 1440 → stop
    ]);
  });

  it("step 1 uses LAST RECORDED amount; steps 2..N use defaultBottleAmountOz (predict-don't-prescribe)", () => {
    // Only step 1 inherits the recorded amount; subsequent projections use defaultBottleAmountOz.
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

    // Step 1: 7oz → 240m (6+oz rule). Steps 2+: 5oz default → 120m.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60, // recorded (7oz)
      11 * 60, // 7:00 + 240m
      13 * 60, // 11:00 + 120m
      15 * 60,
      17 * 60,
      19 * 60,
      21 * 60,
      23 * 60, // next would be 25:00 ≥ 1440 → stop
    ]);
  });

  it("empty bottleIntervalRules → falls back to default for every step (unchanged behavior)", () => {
    // Guard: empty rules falls back to defaultBottleIntervalMinutes every step.
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

    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60 + 30,
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
      20 * 60 + 30,
      23 * 60 + 30, // next would be 26:30 ≥ 1440 → stop
    ]);
  });
});

// ---------------------------------------------------------------------------
// R5.1 — recorded (user-annotated) bottles anchor the cascade
// ---------------------------------------------------------------------------
//
// Owner-assignment on a projected bottle produces a `recorded` doc. Previously
// R5.11 gated on `!events.some(isBottle)` and R5.1 on `isRecordedEvent`, so
// the annotated bottle wasn't recognized as an anchor and no downstream projections fired.
// Fix: treat all non-projected bottles as anchors.
describe("R5.1 — recorded bottles anchor the cascade", () => {
  it("with one recorded bottle at 8:30, projects the remaining bottles_per_day at interval", () => {
    const overridden: Event = aProjectedBottle({
      id: "manual_bottle_1",
      eventKey: "bottle_1",
      start: 8 * 60 + 30,
      lifecycle: { state: "recorded", annotatedAt: 8 * 60 + 30 },
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

    // Anchor + forward cascade to midnight, same as a completed-recorded bottle.
    expect(bottles.map((b) => b.startTime)).toEqual([
      8 * 60 + 30,
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
      20 * 60 + 30,
      23 * 60 + 30,
    ]);
    expect(bottles[0]?.id).toBe(overridden.id);
    expect(bottles[0]?.lifecycle.state).toBe("recorded");
    // ADR-0006: past-now projections auto-promote to recorded.
    expect(
      bottles
        .slice(1)
        .every((b) =>
          b.startTime <= ctx.nowMinutes
            ? b.lifecycle.state === "recorded"
            : b.lifecycle.state === "projected",
        ),
    ).toBe(true);
  });

  it("late-day recorded anchor: forward-only cascade to midnight (no backfill per DOMAIN §2)", () => {
    // Late-day anchor forward-only; missing morning slots not phantom-filled.
    // Recorded at 19:10; forward: 22:10 → 25:10 ≥ 1440 → stop. Result: [19:10, 22:10].
    const overridden: Event = aProjectedBottle({
      id: "manual_bottle_1",
      eventKey: "bottle_1",
      start: 19 * 60 + 10,
      lifecycle: { state: "recorded", annotatedAt: 19 * 60 + 10 },
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

    expect(bottles.map((b) => b.startTime)).toEqual([19 * 60 + 10, 22 * 60 + 10]);
    const uniqueStarts = new Set(bottles.map((b) => b.startTime)); // guard against dup-render regression
    expect(uniqueStarts.size).toBe(bottles.length);
    const anchor = bottles.find((b) => b.id === overridden.id);
    expect(anchor?.lifecycle.state).toBe("recorded");
  });

  it("with two recorded bottles, cascade anchors from the LATER one", () => {
    // Cascade anchors from the latest non-projected bottle by startTime.
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
      lifecycle: { state: "recorded", annotatedAt: 13 * 60 },
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

    // Forward from latest anchor (13:00): 16:00, 19:00, 22:00 → stop.
    expect(bottles.map((b) => b.startTime)).toEqual([10 * 60, 13 * 60, 16 * 60, 19 * 60, 22 * 60]);
  });
});

// ---------------------------------------------------------------------------
// Sequential bottle cascade
// ---------------------------------------------------------------------------
//
// Each bottle's time is computed from the PREVIOUS bottle's actual rendered time (not a grid).
// No-feed region is [nap.start, nap.end] only. Cascade stops at midnight.
// Overnight bottles tally toward bottlesPerDay but don't anchor the cascade.

describe("Sequential bottle cascade — chain coherence", () => {
  it("bottle_3's time is computed from bottle_2's SNAPPED time, not from a grid", () => {
    // Sequential cascade with putdown-anchor: each bottle's time derives from the previous snapped time.
    // bottle_2 at 10:10 → snapOutOfNap 9:30 → putdown 9:15; bottle_3 = 9:15+180 = 12:15 (chain coherence).
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
      nowMinutes: 7 * 60 + 30, // before 9:30 so past-edge fallback doesn't flip snap to nap.end
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
      7 * 60 + 10, // anchor
      9 * 60 + 15, // snapOutOfNap → 9:30, putdown-anchor → 9:15
      12 * 60 + 15, // cascade from 9:15 (not 9:30 — chain coherence)
      15 * 60 + 15,
      18 * 60 + 15,
    ]);
  });

  it("bottle landing exactly at nap.start is allowed (bottle IS the wind-down)", () => {
    // No-feed region is strictly (nap.start, nap.end); a bottle at nap.start is allowed.
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
    // Boundary bottles (at nap.start and nap.end) are kept; strictly inside is filtered.
    expect(bottles.map((b) => b.startTime)).toEqual([7 * 60, 8 * 60, 9 * 60]);
  });
});

describe("Sequential bottle cascade — midnight rule (DOMAIN.md §2)", () => {
  it("cascade stops at midnight (1440), not at tomorrowWake", () => {
    // bottlesPerDay=10, interval=180: slots 7:10…22:10, next 25:10 ≥ 1440 → stop. Emits 6.
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
    expect(bottles[bottles.length - 1]!.startTime).toBeLessThan(24 * 60);
  });

  it("overnight bottle (startTime < wakeTime) does NOT anchor the cascade", () => {
    // Overnight bottle is part of today's day but doesn't anchor; morning cascade starts at wake+buffer.
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
    // Overnight tallies toward the day but doesn't consume a daytime slot.
    // bottlesPerDay=5 chain bottles; overnight is extra.
    expect(bottles.map((b) => b.startTime)).toEqual([
      2 * 60,
      7 * 60 + 10,
      10 * 60 + 10,
      13 * 60 + 10,
      16 * 60 + 10,
      19 * 60 + 10,
    ]);
    expect(bottles[0]?.id).toBe(overnight.id);
  });
});

describe("Sequential bottle cascade — forward-only from anchor", () => {
  it("mid-day recorded anchor: forward-only cascade to midnight, no backfill", () => {
    // Mid-day recording doesn't phantom-anchor missing morning slots.
    // Recorded at 13:00; forward: 16:00, 19:00, 22:00, then 25:00 ≥ 1440 → stop.
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
      13 * 60, // anchor
      16 * 60,
      19 * 60,
      22 * 60, // extends past bottlesPerDay
    ]);
    const recordedOut = bottles.find((b) => b.id === recorded.id);
    expect(recordedOut?.lifecycle.state).toBe("completed");
  });

  it("overnight bottle close to wake shifts the cold-start seed forward", () => {
    // Overnight at 5am (240min interval): 5am + 240min = 9am > wake+buffer 7:10am → seed shifts to 9am.
    const overnight = aRecordedBottle({
      id: "overnight_5am",
      eventKey: "bottle_overnight",
      start: 5 * 60,
      amountOz: 6,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 240,
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
    expect(bottles.map((b) => b.startTime)).toEqual([
      5 * 60, // overnight (tallied; not in chain)
      9 * 60, // shifted seed (5am + 240min)
      13 * 60,
      17 * 60,
      21 * 60, // 4th chain bottle → cold-start cap
    ]);
  });

  it("overnight bottle far from wake leaves cold-start seed at wake+buffer", () => {
    // Overnight at 2am (240min interval): 2am + 240min = 6am < wake+buffer 7:10am → no shift.
    const overnight = aRecordedBottle({
      id: "overnight_2am",
      eventKey: "bottle_overnight",
      start: 2 * 60,
      amountOz: 6,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 240,
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
    expect(bottles.map((b) => b.startTime)).toEqual([
      2 * 60, // overnight (tallied; doesn't consume daytime slot)
      7 * 60 + 10, // wake+buffer (no shift needed)
      11 * 60 + 10,
      15 * 60 + 10,
      19 * 60 + 10, // 4th chain bottle → cold-start cap
    ]);
  });
});

describe("Sequential bottle cascade — bottlesPerDay is a cold-start target, not a hard cap", () => {
  it("when recordings already meet bottlesPerDay, cascade still projects forward (predict-don't-prescribe)", () => {
    // bottlesPerDay is a cold-start target only; once anchors exist, cascade continues to midnight.
    // 5 recordings + 3 forward projections = 8 bottles; not capped at bottlesPerDay=5.
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
      4 * 60, // overnight
      6 * 60, // overnight
      8 * 60 + 32,
      11 * 60 + 14,
      12 * 60 + 12, // latest morning anchor
      15 * 60 + 12,
      18 * 60 + 12,
      21 * 60 + 12, // next 24:12 ≥ 1440 → stop
    ]);
    expect(bottles).toHaveLength(8);
    for (const rec of [overnight1, overnight2, morning1, morning2, morning3]) {
      const out = bottles.find((b) => b.id === rec.id);
      expect(out?.lifecycle.state).toBe("completed");
    }
  });

  it("cold-start still caps at bottlesPerDay (no anchors → bottlesPerDay placeholders)", () => {
    // Cold-start cap applies only when there are no non-projected morning anchors.
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
    // bedtimeThreshold=19:00 emits bedtime event; bottles past 19:00 are not projected.
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
    for (const b of bottles) {
      expect(b.startTime).toBeLessThan(19 * 60); // no bottle at/past bedtime
    }
    // B8: bedtime = max(18:00, 16:30+150=19:00) = 19:00.
    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime?.startTime).toBe(19 * 60);
  });

  it("recorded bottle past bedtime is preserved but does NOT cascade forward from there", () => {
    // Post-bedtime recording stays (reality wins); cascade anchors on the latest in-chain bottle only.
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

    expect(bottles.find((b) => b.id === recordedMorning.id)).toBeDefined();
    expect(bottles.find((b) => b.id === dreamFeed.id)).toBeDefined();
    // No projected bottle at/past bedtime.
    const projectedPastBedtime = bottles.filter(
      (b) => b.lifecycle.state === "projected" && b.startTime >= 19 * 60,
    );
    expect(projectedPastBedtime).toEqual([]);
  });
});

describe("Overnight bottle does NOT interrupt the bedtime block (DOMAIN.md §3)", () => {
  // A bottle logged during the overnight stretch must not split or mutate the bedtime block.
  it("a recorded 3 AM bottle leaves a recorded overnight bedtime untouched", () => {
    const recordedBedtime = aRecordedBedtime({
      id: "actual_bedtime",
      start: 19 * 60, // 19:00
      end: 31 * 60, // 07:00 next morning
    });
    const overnightBottle = aRecordedBottle({
      id: "actual_bottle_3am",
      start: 3 * 60, // 03:00 — inside the overnight stretch
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
      }),
      actuals: [recordedBedtime, overnightBottle],
      nowMinutes: 3 * 60 + 5,
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

    const bedtimes = out.filter((e) => e.type === "bedtime");
    expect(bedtimes).toHaveLength(1); // block did not split
    const bedtime = bedtimes[0]!;

    expect(bedtime.id).toBe(recordedBedtime.id);
    expect(bedtime.startTime).toBe(19 * 60);
    expect(bedtime.endTime).toBe(31 * 60);
    expect(bedtime.lifecycle.state).toBe("completed");

    const naps = out.filter((e) => e.type === "nap");
    expect(naps.find((n) => n.id === overnightBottle.id)).toBeUndefined(); // not converted to a nap

    const preserved = out.find((e) => e.id === overnightBottle.id);
    expect(preserved?.type).toBe("bottle");
    expect(preserved?.startTime).toBe(3 * 60);
    expect(preserved?.lifecycle.state).toBe("completed");
  });
});

describe("PR 3c — putdown bottle-anchor rule (ADR-0006 Concern B)", () => {
  // If a projected bottle lands in [nap.start - lead, nap.start + napLen/2], snap to nap.start - lead.
  // ADR-0006 Concern B: skip the snap if the target is ≤ Now (would cross the Now line backward).

  it("snaps a projected bottle to putdown.startTime when proposed lands in the putdown-anchor range", () => {
    // Recorded bottle at 9:00; interval=180 → proposed 12:00 = nap_2.startTime.
    // Falls in [11:45, 12:22] → snap to 11:45. nowMinutes=8:00 < 11:45 → safe.
    const recorded = aRecordedBottle({
      id: "actual_bottle_morning",
      eventKey: "bottle_1",
      start: 9 * 60,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135],
        defaultNapLengthMinutes: 45,
        putdownLeadMinutes: 15,
        defaultBottleIntervalMinutes: 180,
        bottleChain: { bottlesPerDay: 6, bufferAfterWakeMinutes: 10 },
        bedtimeThreshold: 20 * 60,
        earliestBedtime: 20 * 60,
      }),
      actuals: [recorded],
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

    expect(bottles.find((b) => b.startTime === 11 * 60 + 45)).toBeDefined(); // snapped to putdown start
    expect(bottles.find((b) => b.startTime === 12 * 60)).toBeUndefined(); // not at nap start
  });

  it("leaves a mid-wake-window bottle untouched when no nap is in the putdown range", () => {
    // Recorded at 8:00 → cascade proposes 11:00; putdown range [11:45, 12:22] → 11:00 not in range.
    const recorded = aRecordedBottle({
      id: "actual_bottle_morning",
      eventKey: "bottle_1",
      start: 8 * 60,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135],
        defaultNapLengthMinutes: 45,
        putdownLeadMinutes: 15,
        defaultBottleIntervalMinutes: 180,
        bottleChain: { bottlesPerDay: 6, bufferAfterWakeMinutes: 10 },
        bedtimeThreshold: 20 * 60,
        earliestBedtime: 20 * 60,
      }),
      actuals: [recorded],
      nowMinutes: 7 * 60 + 30,
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

    expect(bottles.find((b) => b.startTime === 11 * 60)).toBeDefined();
  });

  it("ADR-0006 Concern B + putdown+nap one-block: forward-snaps to nap.end when putdown era has opened", () => {
    // Now=11:50 > putdown anchor 11:45 → Concern B blocks backward snap; B4 forward-snaps to nap.endTime=12:45.
    const recorded = aRecordedBottle({
      id: "actual_bottle_morning",
      eventKey: "bottle_1",
      start: 9 * 60,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135],
        defaultNapLengthMinutes: 45,
        putdownLeadMinutes: 15,
        defaultBottleIntervalMinutes: 180,
        bottleChain: { bottlesPerDay: 6, bufferAfterWakeMinutes: 10 },
        bedtimeThreshold: 20 * 60,
        earliestBedtime: 20 * 60,
      }),
      actuals: [recorded],
      nowMinutes: 11 * 60 + 50, // past the would-be snap target (11:45)
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

    expect(bottles.find((b) => b.startTime === 12 * 60 + 45)).toBeDefined(); // forward-snapped to nap_2.endTime
    expect(bottles.find((b) => b.startTime === 11 * 60 + 45)).toBeUndefined(); // backward snap forbidden by Concern B
    expect(bottles.find((b) => b.startTime === 12 * 60)).toBeUndefined(); // no bottle inside the putdown+nap block
  });
});

describe("R5.5 — dream-feed emission", () => {
  it("emits a projected dream-feed bottle at settings.dreamFeedTime when enabled", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        dreamFeedEnabled: true,
        dreamFeedTime: 23 * 60,
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
      { rules: ALL_WITH_NAPS },
    );
    const dream = out.find((e) => e.type === "bottle" && e.eventKey === "bottle_dream");
    expect(dream).toBeDefined();
    expect(dream?.startTime).toBe(23 * 60);
    expect(dream?.label).toBe("Dream Feed");
    expect(dream?.lifecycle.state).toBe("projected");
  });

  it("does NOT emit a dream-feed when disabled", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ dreamFeedEnabled: false }),
      actuals: [],
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
    expect(out.find((e) => e.type === "bottle" && e.eventKey === "bottle_dream")).toBeUndefined();
  });

  it("is idempotent — re-running the engine on the same input yields the same dream-feed", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ dreamFeedEnabled: true, dreamFeedTime: 23 * 60 }),
      actuals: [],
    });
    const input = {
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    };
    const a = projectDay(input, { rules: ALL_WITH_NAPS });
    const b = projectDay(input, { rules: ALL_WITH_NAPS });
    expect(b).toEqual(a);
    const dreams = a.filter((e) => e.type === "bottle" && e.eventKey === "bottle_dream");
    expect(dreams).toHaveLength(1);
  });

  it("auto-promotes to recorded when Now crosses dreamFeedTime (ADR-0001 / PR #255)", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ dreamFeedEnabled: true, dreamFeedTime: 23 * 60 }),
      actuals: [],
      nowMinutes: 23 * 60 + 30,
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
    const dream = out.find((e) => e.type === "bottle" && e.eventKey === "bottle_dream");
    expect(dream?.lifecycle.state).toBe("recorded");
  });

  it("suppresses the projection when a recorded post-bedtime bottle already exists (that recording IS the dream feed)", () => {
    // A recorded post-bedtime bottle fulfills the dream-feed slot; no duplicate projected at dreamFeedTime.
    const recordedWakeFeed: Event = {
      id: "evt-night",
      dayId: "day-1",
      eventKey: "bottle_night",
      type: "bottle",
      kind: "instant",
      label: "Bottle 6",
      startTime: 22 * 60,
      amountOz: 4,
      hasPutdown: false,
      owner: { slot: "parent1" },
      lifecycle: { state: "completed", committedAt: 22 * 60 },
    };
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ dreamFeedEnabled: true, dreamFeedTime: 23 * 60 }),
      actuals: [recordedWakeFeed],
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
    expect(out.find((e) => e.type === "bottle" && e.eventKey === "bottle_dream")).toBeUndefined();
    expect(out.find((e) => e.id === "evt-night")).toBeDefined();
  });

  it("misconfig: dreamFeedTime < bedtime — dream-feed does NOT pollute the rhythm chain's cold-start count", () => {
    // dreamFeedTime=18:00 is inside the rhythm window; dream-feed must be excluded from cold-start counting.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        dreamFeedEnabled: true,
        dreamFeedTime: 18 * 60,
        bedtimeThreshold: 22 * 60 + 30,
        wakeWindowsMinutes: [120, 150, 180, 180, 30],
        defaultNapLengthMinutes: 60,
        defaultBottleIntervalMinutes: 180,
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
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
      { rules: ALL_WITH_NAPS },
    );
    const rhythmBottles = out.filter((e) => e.type === "bottle" && e.eventKey !== "bottle_dream");
    expect(rhythmBottles).toHaveLength(4); // cold-start target unaffected
    const dream = out.find((e) => e.type === "bottle" && e.eventKey === "bottle_dream");
    expect(dream?.startTime).toBe(18 * 60);
  });

  it("rhythm cascade does not renumber the dream-feed slot via R5.4", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ dreamFeedEnabled: true, dreamFeedTime: 23 * 60 }),
      actuals: [],
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
    const dream = out.find((e) => e.type === "bottle" && e.eventKey === "bottle_dream");
    // Dream-feed is excluded from the chronological renumber; key and label are preserved.
    expect(dream?.eventKey).toBe("bottle_dream");
    expect(dream?.label).toBe("Dream Feed");
    const rhythmKeys = out
      .filter((e) => e.type === "bottle" && e.eventKey !== "bottle_dream")
      .map((e) => e.eventKey);
    for (const key of rhythmKeys) {
      expect(key).toMatch(/^bottle_\d+$/);
    }
  });
});

describe("B4 — past-time emit during nap edit snaps to nap edge", () => {
  it("with an in-progress recorded nap, a past-time cascade emit snaps forward to the nap's future endTime", () => {
    // Cascade-natural 11:00 lands inside recorded nap [10:30-13:00]; near edge 10:30 < Now=12:00; B4 forward-snaps to 13:00.
    const recordedBottle = aRecordedBottle({
      id: "rec_b1",
      eventKey: "bottle_1",
      start: 8 * 60,
    });
    const recordedNap = aRecordedNap({
      id: "rec_n1",
      eventKey: "nap_1",
      start: 10 * 60 + 30,
      end: 13 * 60,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [],
        bedtimeThreshold: 22 * 60,
      }),
      actuals: [recordedBottle, recordedNap],
      nowMinutes: 12 * 60,
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
    const projectedBottles = out
      .filter((e) => e.type === "bottle" && e.lifecycle.state === "projected")
      .sort((a, b) => a.startTime - b.startTime);
    expect(projectedBottles.length).toBeGreaterThan(0);
    for (const b of projectedBottles) {
      expect(b.startTime).toBeGreaterThanOrEqual(12 * 60); // never inside the past portion of the nap
    }
    expect(projectedBottles[0]?.startTime).toBe(13 * 60);
  });

  it("projected nap with putdown.start past Now — bottle skips the past putdown AND nap.start, lands at nap.endTime", () => {
    // Cascade-natural 2:50p lands in putdown range [2:45p, 3:00p]; Concern B blocks snap; B4 forward-snaps to nap.endTime=3:45p.
    const recordedBottle = aRecordedBottle({
      id: "rec_b1",
      eventKey: "bottle_1",
      start: 11 * 60 + 50, // 11:50am + 180min interval = 2:50p cascade emit
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 8 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 2, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [7 * 60], // 8am + 7h → nap_1 at 3:00-3:45p
        defaultNapLengthMinutes: 45,
        putdownLeadMinutes: 15,
        bedtimeThreshold: 22 * 60,
      }),
      actuals: [recordedBottle],
      nowMinutes: 14 * 60 + 59,
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
    const projectedBottles = out
      .filter((e) => e.type === "bottle" && e.lifecycle.state === "projected")
      .sort((a, b) => a.startTime - b.startTime);
    for (const b of projectedBottles) {
      expect(b.startTime).toBeGreaterThan(14 * 60 + 59); // all projected bottles must be future
    }
    const nextBottle = projectedBottles[0];
    expect(nextBottle?.startTime).not.toBe(15 * 60); // not at nap.startTime (3:00p, end-of-putdown)
    expect(nextBottle?.startTime).toBe(15 * 60 + 45); // at nap.endTime (3:45p)
  });

  it("proposed === Now during in-progress putdown still snaps forward to nap.endTime", () => {
    // Proposed=3:10p=Now; putdown era already open (lo=3:05p ≤ Now); B4 gates on era, not tense → snaps to nap.endTime=4:05p.
    const recordedBottle = aRecordedBottle({
      id: "rec_b1",
      eventKey: "bottle_1",
      start: 12 * 60 + 10,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 8 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 2, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [7 * 60 + 20], // 8am + 7h20m → nap_1 at 3:20-4:05p
        defaultNapLengthMinutes: 45,
        putdownLeadMinutes: 15,
        bedtimeThreshold: 22 * 60,
      }),
      actuals: [recordedBottle],
      nowMinutes: 15 * 60 + 10, // 3:10p = exactly the cascade emit time
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
    const projectedBottles = out
      .filter((e) => e.type === "bottle" && e.lifecycle.state === "projected")
      .sort((a, b) => a.startTime - b.startTime);
    expect(projectedBottles[0]?.startTime).toBe(16 * 60 + 5); // 4:05p = nap_1.endTime
  });

  it("cold-start (no recorded events) is unaffected — past-time emits still happen and auto-promote claims them", () => {
    // No recorded nap → B4 gated off; cold-start chain emits naturally; auto-promote upgrades past-Now slots.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 3, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [],
        bedtimeThreshold: 22 * 60,
      }),
      actuals: [],
      nowMinutes: 12 * 60,
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
    expect(bottles[0]?.startTime).toBe(7 * 60 + 10); // first slot at wakeTime + buffer; past Now=12:00 → auto-promoted
    expect(bottles[0]?.lifecycle.state).toBe("recorded");
  });
});
