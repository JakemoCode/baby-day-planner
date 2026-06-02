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
import { recordedIdForEvent } from "../../lib/eventConventions";
import { RULES as NAP_RULES } from "./naps";
import { RULES as BOTTLE_RULES } from "./bottles";

const ALL: Rule[] = [...BOTTLE_RULES];
const ALL_WITH_NAPS: Rule[] = [...NAP_RULES, ...BOTTLE_RULES];
// ALL_WITH_BEDTIME: alias for tests depending on the sleep cascade's bedtime emission.
const ALL_WITH_BEDTIME: Rule[] = [...NAP_RULES, ...BOTTLE_RULES];

describe("R5.11 — placeholder projection when no bottle has been recorded", () => {
  it("projects a full-day chain of placeholders, anchored at wake + buffer, spaced by interval (to the cap)", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
    // §F66: cold-start fills the whole day to the cap (here midnight — no bedtime
    // rule in this isolated set), identical to the anchored chain. The cascade is
    // purely interval-driven; there is no count cap.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // 7:10
      10 * 60 + 10, // 10:10
      13 * 60 + 10, // 13:10
      16 * 60 + 10, // 16:10
      19 * 60 + 10, // 19:10
      22 * 60 + 10, // 22:10
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
  it("cascade caps at the last slot before midnight (1440)", () => {
    // §F66 (no absorption): a 7:10 morning forecast precedes the recorded 7:30 (it's
    // not absorbed — recorded bottles never delete a forecast), then forward from 7:30:
    // 10:30, 13:30, 16:30, 19:30, 22:30; next 25:30 ≥ 1440 → stop. 7 bottles total.
    const recorded = aRecordedBottle({
      id: "actual_bottle_first",
      eventKey: "bottle_1",
      start: 7 * 60 + 30,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

    expect(bottles).toHaveLength(7);
    expect(bottles[0]!.startTime).toBe(7 * 60 + 10); // morning forecast survives
    expect(bottles[bottles.length - 1]!.startTime).toBe(22 * 60 + 30);
    expect(bottles.every((b) => b.startTime < 24 * 60)).toBe(true);
  });
});

describe("R5.4 — labels renumber chronologically (all bottles); recorded eventKeys frozen", () => {
  it("labels two recorded bottles by clock order while their non-chronological eventKeys stay frozen", () => {
    const recordedAt0730WithLaterKey = aRecordedBottle({
      id: "b_0730",
      eventKey: "bottle_2",
      label: "Bottle 2",
      start: 7 * 60 + 30,
    });
    const recordedAt0900WithEarlierKey = aRecordedBottle({
      id: "b_0900",
      eventKey: "bottle_1",
      label: "Bottle 1",
      start: 9 * 60,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
      }),
      actuals: [recordedAt0730WithLaterKey, recordedAt0900WithEarlierKey],
      nowMinutes: 10 * 60,
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

    // §F66 (no absorption): a 7:10 morning forecast precedes both recorded bottles,
    // so they're no longer at indices 0/1 — find them by id. Their eventKeys stay
    // frozen; labels follow clock order.
    const b0730 = bottles.find((b) => b.id === "b_0730")!;
    const b0900 = bottles.find((b) => b.id === "b_0900")!;
    expect(b0730.eventKey).toBe("bottle_2"); // frozen, non-chronological
    expect(b0900.eventKey).toBe("bottle_1"); // frozen, non-chronological
    bottles.forEach((b, i) => expect(b.label).toBe(`Bottle ${i + 1}`));
    const firstProjected = bottles.find((b) => b.lifecycle.state === "projected");
    // §F66 (no absorption): morning 7:10 forecast is assigned bottle_3; first future-projected is bottle_4.
    expect(firstProjected!.eventKey).toBe("bottle_4"); // slots fill after maxRecorded (2) + morning forecast (3)
  });

  it("relabels a time-edited recorded bottle to its new chronological position, keeping its eventKey", () => {
    const recorded = aRecordedBottle({
      id: "b_recorded",
      eventKey: "bottle_3",
      label: "Bottle 3",
      start: 12 * 60 + 30,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
    expect(rec.eventKey).toBe("bottle_3");
    expect(rec.label).toBe(`Bottle ${bottles.indexOf(rec) + 1}`);
    bottles.forEach((b, i) => expect(b.label).toBe(`Bottle ${i + 1}`));
    // §F66 (no absorption): 7:10 AND 10:10 morning forecasts precede the 12:30 anchor
    // (neither absorbed), both auto-promoted past now=13:00 → maxRecorded=5, so the
    // first future-projected bottle (15:30) is slot 6.
    const firstProjected = bottles.find((b) => b.lifecycle.state === "projected");
    expect(firstProjected!.eventKey).toBe("bottle_6");
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

    // §F66 (no absorption): morning 7:10 forecast survives; recorded at 8:30 + cascade to midnight: 11:30…23:30.
    // The chain fills to the cap, not a fixed count.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // morning forecast (not absorbed)
      8 * 60 + 30,
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
      20 * 60 + 30,
      23 * 60 + 30,
    ]);

    const rec = bottles.find((b) => b.id === recorded.id)!;
    expect(rec.lifecycle.state).toBe("completed");

    // ADR-0006: past-now projections auto-promote to recorded.
    const projections = bottles.filter((b) => b.id !== recorded.id);
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

describe("§F66 PR1 — full-day cascade: morning bottles survive a recorded afternoon bottle", () => {
  it("fills morning forecast slots before a far-out recorded anchor (not forward-only)", () => {
    // One recorded bottle at 2:00pm, wake 7:00, 180-min cadence. The morning has
    // room for forecasts at ~7:10 and ~10:10 before the 2pm anchor; forward-only
    // (old R5.1) would drop them. Reality wins: morning reality must not vanish.
    const recorded = aRecordedBottle({
      id: "recorded_bottle_afternoon",
      eventKey: "bottle_4",
      start: 14 * 60,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
      }),
      actuals: [recorded],
    });

    const out = projectDay(
      { day: ctx.day, settings: ctx.settings, actuals: ctx.actuals, nowMinutes: 14 * 60 + 30 },
      { rules: ALL },
    );
    const times = out
      .filter((e) => e.type === "bottle")
      .map((b) => b.startTime)
      .sort((a, b) => a - b);

    // Morning forecasts present alongside the 2pm anchor (not erased by it).
    expect(times).toContain(7 * 60 + 10);
    expect(times).toContain(10 * 60 + 10);
    expect(times).toContain(14 * 60);
  });
});

describe("§F66 — cascade is idempotent under persist-the-past (flicker regression)", () => {
  // The auto-promote hook persists now-crossed projections on view. The forecast
  // must not change when it does: a now-crossed projection and a persisted-recorded
  // bottle at the same time must yield the SAME forward chain. Today the cold-start
  // chain caps differently from the anchored chain, so the bottle SET flips on view.
  it("persisting the now-crossed past leaves the bottle set unchanged", () => {
    const settings = aSettings({
      bottleChain: { bufferAfterWakeMinutes: 10 },
      defaultBottleIntervalMinutes: 180,
      wakeWindowsMinutes: [],
      bedtimeThreshold: 23 * 60,
    });
    const day = aDay({ wakeTime: 60 }); // matches Jake's day: first feed ~1:10
    const now = 13 * 60;

    const out1 = projectDay({ day, settings, actuals: [], nowMinutes: now });
    const times1 = out1
      .filter((e) => e.type === "bottle")
      .map((b) => b.startTime)
      .sort((a, b) => a - b);

    // Simulate useAutoPromotePersistence: persist the now-crossed (past) projections.
    const persisted: Event[] = out1
      .filter(
        (e) => e.type === "bottle" && e.lifecycle.state === "recorded" && e.id.startsWith("proj_"),
      )
      .map((e) => ({ ...e, id: recordedIdForEvent(e) }));

    const out2 = projectDay({ day, settings, actuals: persisted, nowMinutes: now });
    const times2 = out2
      .filter((e) => e.type === "bottle")
      .map((b) => b.startTime)
      .sort((a, b) => a - b);

    expect(times2).toEqual(times1);
  });
});

describe("§F66 PR2 — recorded cluster feeds both survive (reality wins)", () => {
  it("two recorded bottles closer than one interval are both kept (neither absorbed)", () => {
    // Cluster: 10:00 and 10:20, well inside the 180-min cadence. Both are reality —
    // the cascade must not collapse them into one nor drop the second.
    const first = aRecordedBottle({
      id: "recorded_bottle_t600",
      eventKey: "bottle_1",
      start: 10 * 60,
      lifecycle: { state: "recorded", annotatedAt: 10 * 60 },
    });
    const second = aRecordedBottle({
      id: "recorded_bottle_t620",
      eventKey: "bottle_2",
      start: 10 * 60 + 20,
      lifecycle: { state: "recorded", annotatedAt: 10 * 60 + 20 },
    });

    const out = projectDay(
      {
        day: aDay({ wakeTime: 7 * 60 }),
        settings: aSettings({
          bottleChain: { bufferAfterWakeMinutes: 10 },
          defaultBottleIntervalMinutes: 180,
          wakeWindowsMinutes: [],
          bedtimeThreshold: 23 * 60,
        }),
        actuals: [first, second],
        nowMinutes: 11 * 60,
      },
      { rules: ALL },
    );

    const recordedTimes = out
      .filter((e) => e.type === "bottle" && e.lifecycle.state !== "projected")
      .map((b) => b.startTime);
    expect(recordedTimes).toContain(10 * 60);
    expect(recordedTimes).toContain(10 * 60 + 20);
  });
});

describe("§F66 PR2 — bottle-volume invariant", () => {
  it("total volume = Σ recorded amounts + (projected count × default)", () => {
    const DEFAULT = 5;
    const recorded = [
      aRecordedBottle({
        id: "recorded_bottle_t450",
        eventKey: "bottle_1",
        start: 7 * 60 + 30,
        amountOz: 4,
        lifecycle: { state: "recorded", annotatedAt: 7 * 60 + 30 },
      }),
      aRecordedBottle({
        id: "recorded_bottle_t630",
        eventKey: "bottle_2",
        start: 10 * 60 + 30,
        amountOz: 6,
        lifecycle: { state: "recorded", annotatedAt: 10 * 60 + 30 },
      }),
    ];

    const out = projectDay(
      {
        day: aDay({ wakeTime: 7 * 60 }),
        settings: aSettings({
          bottleChain: { bufferAfterWakeMinutes: 10 },
          defaultBottleIntervalMinutes: 180,
          defaultBottleAmountOz: DEFAULT,
          wakeWindowsMinutes: [],
          bedtimeThreshold: 23 * 60,
        }),
        actuals: recorded,
        nowMinutes: 11 * 60,
      },
      { rules: ALL },
    );

    const bottles = out.filter((e) => e.type === "bottle");
    const total = bottles.reduce((sum, b) => sum + (b.amountOz ?? 0), 0);
    // §F66 (no absorption): a 7:10 morning forecast precedes the recorded bottles and is
    // auto-promoted (state="recorded") with DEFAULT amountOz — it's not an actual, so
    // count it alongside projected bottles for the DEFAULT-oz contribution.
    const actualIds = new Set(recorded.map((r) => r.id));
    const nonActualCount = bottles.filter((b) => !actualIds.has(b.id)).length;

    // Every projected bottle carries the default; recorded carry their real amount.
    bottles
      .filter((b) => b.lifecycle.state === "projected")
      .forEach((b) => expect(b.amountOz).toBe(DEFAULT));
    expect(total).toBe(4 + 6 + nonActualCount * DEFAULT);
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
    // (Chain now fills the whole day; the snapped slot is present, not necessarily last.)
    const times = bottles.map((b) => b.startTime);
    expect(times).toContain(9 * 60 + 45);
    expect(times.filter((t) => t >= 10 * 60 && t < 11 * 60)).toEqual([]); // none inside the nap
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

    // First four show the snap/putdown-anchor sequence; the chain now fills the
    // rest of the day (§F66), so assert the documented prefix.
    expect(bottles.slice(0, 4).map((b) => b.startTime)).toEqual([
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

    // §F66 (no absorption): 7:10 morning forecast survives. Then recorded 8:00 (4oz) → 120m cascade.
    // Steps 2+: default 5oz → 0-5oz rule → 120m.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // morning forecast (not absorbed)
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

    // §F66 (no absorption): 7:10 morning forecast survives. Then recorded 8:00 (6oz) → 180m (no rule match).
    // Steps 2+: 5oz default → 0-5oz rule → 120m.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // morning forecast (not absorbed)
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

    // §F66 (no absorption): 7:10 morning forecast survives alongside recorded 8:30 anchor.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // morning forecast (not absorbed)
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

    // §F66 (no absorption): morning 7:10 forecast survives alongside the 8:30 anchor.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // morning forecast (not absorbed)
      8 * 60 + 30,
      11 * 60 + 30,
      14 * 60 + 30,
      17 * 60 + 30,
      20 * 60 + 30,
      23 * 60 + 30,
    ]);
    const anchor = bottles.find((b) => b.id === overridden.id)!;
    expect(anchor.lifecycle.state).toBe("recorded");
    // ADR-0006: past-now projections auto-promote to recorded.
    expect(
      bottles
        .filter((b) => b.id !== overridden.id)
        .every((b) =>
          b.startTime <= ctx.nowMinutes
            ? b.lifecycle.state === "recorded"
            : b.lifecycle.state === "projected",
        ),
    ).toBe(true);
  });

  it("late-day recorded anchor: full-day cascade fills morning slots + forward (§F66)", () => {
    // §F66: past reality must not vanish. Morning forecasts (7:10, 10:10, 13:10,
    // 16:10) fill before the 19:10 anchor; forward from it: 22:10 (25:10 ≥ 1440 stop).
    const overridden: Event = aProjectedBottle({
      id: "manual_bottle_1",
      eventKey: "bottle_1",
      start: 19 * 60 + 10,
      lifecycle: { state: "recorded", annotatedAt: 19 * 60 + 10 },
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
      19 * 60 + 10, // anchor
      22 * 60 + 10,
    ]);
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

    // §F66 (no absorption): 7:10 morning forecast survives. Forward from latest anchor (13:00): 16:00, 19:00, 22:00.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // morning forecast (not absorbed)
      10 * 60,
      13 * 60,
      16 * 60,
      19 * 60,
      22 * 60,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Sequential bottle cascade
// ---------------------------------------------------------------------------
//
// Each bottle's time is computed from the PREVIOUS bottle's actual rendered time (not a grid).
// No-feed region is [nap.start, nap.end] only. Cascade stops at midnight.
// Overnight bottles are part of the day but don't anchor the cascade.

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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
      21 * 60 + 15, // §F66: chain fills the whole day, no count cap
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
        bottleChain: { bufferAfterWakeMinutes: 0 },
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
    // (Chain now fills past 9:00; assert the documented boundary prefix + nothing
    // strictly inside the nap.)
    expect(bottles.slice(0, 3).map((b) => b.startTime)).toEqual([7 * 60, 8 * 60, 9 * 60]);
    expect(bottles.map((b) => b.startTime).filter((t) => t > 8 * 60 && t < 9 * 60)).toEqual([]);
  });
});

describe("Sequential bottle cascade — midnight rule (DOMAIN.md §2)", () => {
  it("cascade stops at midnight (1440), not at tomorrowWake", () => {
    // interval=180: slots 7:10…22:10, next 25:10 ≥ 1440 → stop. Emits 6.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
    // Overnight is part of the day but doesn't anchor; the daytime chain fills
    // wake+buffer → cap (§F66, no count cap), overnight is extra.
    expect(bottles.map((b) => b.startTime)).toEqual([
      2 * 60,
      7 * 60 + 10,
      10 * 60 + 10,
      13 * 60 + 10,
      16 * 60 + 10,
      19 * 60 + 10,
      22 * 60 + 10,
    ]);
    expect(bottles[0]?.id).toBe(overnight.id);
  });
});

describe("Sequential bottle cascade — full-day from anchor (§F66)", () => {
  it("mid-day recorded anchor: morning fill + forward, near slot now survives (no absorption)", () => {
    // §F66 (no absorption): 7:10 morning forecast AND the ~10:10 cold-start slot both survive
    // alongside the 13:00 anchor — forecast slots are never deleted by a recorded bottle.
    const recorded = aRecordedBottle({
      id: "actual_bottle_midday",
      eventKey: "bottle_midday",
      start: 13 * 60,
      amountOz: 5,
    });
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
      7 * 60 + 10, // morning forecast
      10 * 60 + 10, // near-slot survives (not absorbed)
      13 * 60, // anchor
      16 * 60,
      19 * 60,
      22 * 60, // fills to the cap
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
      2 * 60, // overnight (doesn't consume a daytime slot)
      7 * 60 + 10, // wake+buffer (no shift needed)
      11 * 60 + 10,
      15 * 60 + 10,
      19 * 60 + 10,
      23 * 60 + 10, // §F66: chain fills to the cap, no count limit
    ]);
  });
});

describe("Sequential bottle cascade — fills forward past recordings, no count cap", () => {
  it("with many recordings already, cascade still projects forward to the cap (predict-don't-prescribe)", () => {
    // Once anchors exist, cascade continues to midnight.
    // 5 recordings + 3 forward projections = 8 bottles; no count cap.
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

  it("cold-start fills the whole day to the cap — no count limit (§F66)", () => {
    // §F66: cold-start and anchored emit the identical interval-filled chain, so
    // persisting the now-crossed past can't change the forecast (no flicker).
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
    // No bedtime in this isolated set → cap is midnight; fills 7:10…22:10.
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10,
      10 * 60 + 10,
      13 * 60 + 10,
      16 * 60 + 10,
      19 * 60 + 10,
      22 * 60 + 10,
    ]);
  });
});

describe("Sequential bottle cascade — caps forward at bedtime (DOMAIN.md §1 + §3)", () => {
  it("cold-start cascade stops at projected bedtime, not at midnight", () => {
    // bedtimeThreshold=19:00 emits bedtime event; bottles past 19:00 are not projected.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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

  it("misconfig: dreamFeedTime < bedtime — dream-feed does NOT alter the rhythm chain", () => {
    // dreamFeedTime=18:00 is inside the rhythm window; the dream-feed must be a
    // separate slot that neither adds to nor shifts the rhythm chain.
    const settings = (dreamFeedEnabled: boolean) =>
      aSettings({
        dreamFeedEnabled,
        dreamFeedTime: 18 * 60,
        bedtimeThreshold: 22 * 60 + 30,
        wakeWindowsMinutes: [120, 150, 180, 180, 30],
        defaultNapLengthMinutes: 60,
        defaultBottleIntervalMinutes: 180,
        bottleChain: { bufferAfterWakeMinutes: 10 },
      });
    const run = (dreamFeedEnabled: boolean) =>
      projectDay(
        {
          day: aDay({ wakeTime: 7 * 60 }),
          settings: settings(dreamFeedEnabled),
          actuals: [],
          nowMinutes: 12 * 60,
        },
        { rules: ALL_WITH_NAPS },
      );
    const rhythmTimes = (out: Event[]) =>
      out
        .filter((e) => e.type === "bottle" && e.eventKey !== "bottle_dream")
        .map((b) => b.startTime)
        .sort((a, b) => a - b);

    // Enabling the dream-feed must not change the rhythm chain at all.
    expect(rhythmTimes(run(true))).toEqual(rhythmTimes(run(false)));
    const dream = run(true).find((e) => e.type === "bottle" && e.eventKey === "bottle_dream");
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
        bottleChain: { bufferAfterWakeMinutes: 10 },
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
