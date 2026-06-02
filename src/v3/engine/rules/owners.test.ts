/**
 * R12.x — Template-driven owner inheritance.
 */

import { describe, expect, it } from "vitest";
import {
  PARENT1,
  PARENT2,
  aContext,
  aDay,
  aRecordedBottle,
  aRecordedNap,
  aSettings,
  aTemplate,
  otherOwner,
} from "../../__tests__/factories";
import { NO_OWNER, type Context, type Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { projectDay } from "../projectDay";
import { ALL_RULES } from "./index";

const ALL: Rule[] = [...ALL_RULES];

// Conditional spread required for exactOptionalPropertyTypes: true.
function run(ctx: Context): Event[] {
  return projectDay(
    {
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
      ...(ctx.template !== undefined ? { template: ctx.template } : {}),
    },
    { rules: ALL },
  );
}

describe("R12.2 — projected naps inherit template.napOwners[N-1]", () => {
  it("4-nap cascade with full napOwners list assigns owners 1..4", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60, // push bedtime out so all 4 naps emit
      }),
      template: aTemplate({
        napOwners: [PARENT1, PARENT2, otherOwner("daycare"), PARENT2],
      }),
      actuals: [],
    });

    const out = run(ctx);

    const naps = out.filter((e) => e.type === "nap").sort((a, b) => a.startTime - b.startTime);
    expect(naps).toHaveLength(4);
    expect(naps[0]!.owner).toEqual(PARENT1);
    expect(naps[1]!.owner).toEqual(PARENT2);
    expect(naps[2]!.owner).toEqual(otherOwner("daycare"));
    expect(naps[3]!.owner).toEqual(PARENT2);
  });

  it("template list shorter than nap count → leftover naps have no owner", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({ napOwners: [PARENT1, PARENT2] }),
      actuals: [],
    });

    const out = run(ctx);

    const naps = out.filter((e) => e.type === "nap").sort((a, b) => a.startTime - b.startTime);
    expect(naps[0]!.owner).toEqual(PARENT1);
    expect(naps[1]!.owner).toEqual(PARENT2);
    expect(naps[2]!.owner).toEqual({ slot: "none" });
    expect(naps[3]!.owner).toEqual({ slot: "none" });
  });

  it("sparse napOwners (undefined slot in middle) → that nap has no owner; neighbors do", () => {
    // Schema allows sparse lists (e.g. user assigns nap_3 before nap_2); engine skips undefined slots.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({ napOwners: [PARENT1, undefined, PARENT2, PARENT1] }),
      actuals: [],
    });

    const out = run(ctx);

    const naps = out.filter((e) => e.type === "nap").sort((a, b) => a.startTime - b.startTime);
    expect(naps[0]!.owner).toEqual(PARENT1);
    expect(naps[1]!.owner).toEqual({ slot: "none" });
    expect(naps[2]!.owner).toEqual(PARENT2);
    expect(naps[3]!.owner).toEqual(PARENT1);
  });

  it("no template → no projected nap has an owner", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      actuals: [],
    });

    const out = run(ctx);

    const naps = out.filter((e) => e.type === "nap");
    expect(naps.every((n) => n.owner.slot === "none")).toBe(true);
  });
});

describe("R12.1 — clearing is deliberate: cleared owner is not re-stamped", () => {
  it("recorded nap with no owner + template entry → owner stays undefined", () => {
    // A recorded event with no owner is a deliberate clear; template must not re-stamp it.
    const recordedClearedOwner = aRecordedNap({
      id: "actual_nap_2_cleared",
      eventKey: "nap_2",
      start: 12 * 60,
      end: 13 * 60,
      // owner omitted intentionally
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({
        napOwners: [PARENT2, PARENT2, PARENT2, PARENT2],
      }),
      actuals: [recordedClearedOwner],
    });

    const out = run(ctx);
    const napTwo = out.find((e) => e.id === recordedClearedOwner.id);
    expect(napTwo?.owner).toEqual({ slot: "none" }); // template did NOT re-stamp
  });

  it("overridden projection is NOT re-stamped (deliberate user-edit choice persists)", () => {
    // A recorded lifecycle on a future nap is a user-edit; template must not re-stamp the cleared owner.
    const overriddenNap2: Event = {
      id: "overridden_nap_2",
      dayId: "day_test",
      eventKey: "nap_2",
      type: "nap",
      kind: "block",
      startTime: 12 * 60,
      endTime: 13 * 60,
      label: "Nap 2",
      hasPutdown: false,
      lifecycle: { state: "recorded", annotatedAt: 11 * 60 },
      owner: NO_OWNER, // user explicitly cleared via drawer
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({
        napOwners: [PARENT2, PARENT2, PARENT2, PARENT2],
      }),
      actuals: [overriddenNap2],
    });

    const out = run(ctx);
    const napTwo = out.find((e) => e.id === overriddenNap2.id);
    expect(napTwo?.owner).toEqual({ slot: "none" });
    expect(napTwo?.lifecycle.state).toBe("recorded");
  });
});

describe("R12.x — eventKey index parsing rejects malformed keys", () => {
  it("an event with eventKey 'nap_1abc' (non-strict numeric suffix) gets no template owner", () => {
    // parseInt('1abc') returns 1 and would falsely map to napOwners[0]; strict parser rejects mixed-suffix keys.
    const malformedNap: Event = {
      id: "weird_id",
      dayId: "day_test",
      eventKey: "nap_1abc",
      type: "nap",
      kind: "block",
      startTime: 9 * 60,
      endTime: 10 * 60,
      label: "Nap",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [], // skip cascade so nothing else runs
      }),
      template: aTemplate({ napOwners: [PARENT1, PARENT1, PARENT1, PARENT1] }),
      actuals: [malformedNap],
    });

    const out = run(ctx);
    const found = out.find((e) => e.id === malformedNap.id);
    expect(found?.owner).toEqual({ slot: "none" });
  });
});

describe("R12.1 — recorded events keep their owner; template doesn't override", () => {
  it("recorded nap_2 with PARENT1 stays PARENT1 even when template says PARENT2", () => {
    const recorded = aRecordedNap({
      id: "actual_nap_2",
      eventKey: "nap_2",
      start: 12 * 60,
      end: 13 * 60,
      owner: PARENT1,
    });

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({
        napOwners: [PARENT2, PARENT2, PARENT2, PARENT2],
      }),
      actuals: [recorded],
    });

    const out = run(ctx);

    const napTwo = out.find((e) => e.id === recorded.id);
    expect(napTwo).toBeDefined();
    expect(napTwo!.owner).toEqual(PARENT1); // recorded owner preserved
    const others = out.filter((e) => e.type === "nap" && e.id !== recorded.id);
    expect(others.every((n) => n.owner.slot === "parent2")).toBe(true);
  });
});

describe("R12.3 — projected wake_windows inherit template.wakeWindowOwners[N-1] only", () => {
  it("wake_windows take their owner from the template list, NOT from same-index nap", () => {
    // Lists intentionally diverge to guard against napOwners bleeding into WW slots.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({
        napOwners: [PARENT1, PARENT1, PARENT1, PARENT1],
        wakeWindowOwners: [PARENT2, PARENT2, PARENT2, PARENT2],
      }),
      actuals: [],
    });

    const out = run(ctx);

    // First 4 WWs covered by template; cadence-extended WWs beyond the list have no owner.
    const wws = out
      .filter((e) => e.type === "wake_window")
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 4);
    expect(wws).toHaveLength(4);
    expect(wws.every((w) => w.owner.slot === "parent2")).toBe(true);
    const naps = out.filter((e) => e.type === "nap").slice(0, 4);
    expect(naps.every((n) => n.owner.slot === "parent1")).toBe(true);
  });

  it("template wakeWindowOwners absent → wake windows have no owner (no fallback to nap owner)", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({
        napOwners: [PARENT1, PARENT2, PARENT1, PARENT2],
        wakeWindowOwners: [], // explicitly empty
      }),
      actuals: [],
    });

    const out = run(ctx);

    const wws = out.filter((e) => e.type === "wake_window");
    expect(wws.every((w) => w.owner.slot === "none")).toBe(true);
  });
});

describe("R12.5 — projected bedtime inherits template.bedtimeOwner if set", () => {
  it("bedtime owner from template", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      template: aTemplate({ bedtimeOwner: PARENT1 }),
      actuals: [],
    });

    const out = run(ctx);

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.owner).toEqual(PARENT1);
  });

  it("template without bedtimeOwner → bedtime has no owner", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      template: aTemplate({}),
      actuals: [],
    });

    const out = run(ctx);

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime?.owner).toEqual({ slot: "none" });
  });
});

describe("R12.6 — projected bottles inherit template.bottleOwners[N-1] (chronological)", () => {
  it("4 placeholder bottles get owners by chronological index", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [], // disable nap chain so bottles run alone
      }),
      template: aTemplate({
        bottleOwners: [PARENT1, PARENT2, PARENT1, PARENT2],
      }),
      actuals: [],
    });

    const out = run(ctx);

    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);
    expect(bottles).toHaveLength(4);
    expect(bottles[0]!.owner).toEqual(PARENT1);
    expect(bottles[1]!.owner).toEqual(PARENT2);
    expect(bottles[2]!.owner).toEqual(PARENT1);
    expect(bottles[3]!.owner).toEqual(PARENT2);
  });

  it("stamps bottleOwners by chronological position onto projected bottles even when recorded eventKeys are non-chronological", () => {
    const bottleOwners = [PARENT1, PARENT2, PARENT1, PARENT2];
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [],
      }),
      template: aTemplate({ bottleOwners }),
      actuals: [
        aRecordedBottle({ id: "b_a", eventKey: "bottle_2", start: 7 * 60 + 30 }),
        aRecordedBottle({ id: "b_b", eventKey: "bottle_1", start: 9 * 60 }),
      ],
      nowMinutes: 10 * 60,
    });

    const out = run(ctx);
    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);

    bottles.forEach((b, i) => expect(b.label).toBe(`Bottle ${i + 1}`));
    const ownerOf = (eventKey: string) => bottles.find((b) => b.eventKey === eventKey)!.owner;
    expect(ownerOf("bottle_3")).toEqual(bottleOwners[2]);
    expect(ownerOf("bottle_4")).toEqual(bottleOwners[3]);
  });

  it("projected bottle BEFORE a recorded one is owned by chronological position, not slot (§F66 PR2)", () => {
    // Full-day cascade (PR1) lets morning projections fall before a pre-logged
    // afternoon bottle. Their eventKey slots start above maxRecorded, so slot-based
    // mapping would mis-assign; owner must follow clock position.
    const bottleOwners = [PARENT1, PARENT2, PARENT1, PARENT2];
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [],
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({ bottleOwners }),
      // A caregiver pre-logs an afternoon daycare bottle; eventKey bottle_1 is frozen.
      actuals: [
        aRecordedBottle({
          id: "recorded_bottle_t840",
          eventKey: "bottle_1",
          start: 14 * 60,
          lifecycle: { state: "recorded", annotatedAt: 14 * 60 },
        }),
      ],
      nowMinutes: 7 * 60, // morning bottles stay projected (future of Now)
    });

    const out = run(ctx);
    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);

    // First two bottles (earliest by clock) are projected morning feeds.
    expect(bottles[0]!.lifecycle.state).toBe("projected");
    expect(bottles[0]!.owner).toEqual(bottleOwners[0]); // chronological position 1
    expect(bottles[1]!.owner).toEqual(bottleOwners[1]); // position 2
  });

  it("no template.bottleOwners → bottles have no owner (default cleared)", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 3, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [],
      }),
      template: aTemplate({}), // no bottleOwners
      actuals: [],
    });

    const out = run(ctx);

    const bottles = out.filter((e) => e.type === "bottle");
    expect(bottles.every((b) => b.owner.slot === "none")).toBe(true);
  });
});

// R12.10 — Day.ownerOverrides: beats template defaults; null = NO_OWNER; never touches recorded events.
describe("R12.10 — Day.ownerOverrides applies to projected events", () => {
  it("override on a projected nap eventKey beats the template default", () => {
    const ctx = aContext({
      day: aDay({
        wakeTime: 7 * 60,
        ownerOverrides: { nap_1: PARENT2 },
      }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({ napOwners: [PARENT1, PARENT1] }),
      actuals: [],
    });

    const out = run(ctx);
    const naps = out.filter((e) => e.type === "nap").sort((a, b) => a.startTime - b.startTime);
    expect(naps[0]!.owner).toEqual(PARENT2);
    expect(naps[1]!.owner).toEqual(PARENT1); // no override → template default
  });

  it("override on a projected bottle keys off chronological position, beating the template (§F66 PR2)", () => {
    const ctx = aContext({
      day: aDay({
        wakeTime: 7 * 60,
        ownerOverrides: { bottle_pos_2: PARENT2 }, // 2nd bottle of the day → P2
      }),
      settings: aSettings({
        bottleChain: { bottlesPerDay: 3, bufferAfterWakeMinutes: 10 },
        defaultBottleIntervalMinutes: 180,
        wakeWindowsMinutes: [],
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({ bottleOwners: [PARENT1, PARENT1, PARENT1] }),
      actuals: [],
    });

    const out = run(ctx);
    const bottles = out
      .filter((e) => e.type === "bottle")
      .sort((a, b) => a.startTime - b.startTime);
    expect(bottles[0]!.owner).toEqual(PARENT1);
    expect(bottles[1]!.owner).toEqual(PARENT2); // positional override beats template
    expect(bottles[2]!.owner).toEqual(PARENT1);
  });

  it("ownerOverride does NOT anchor the event's time or lifecycle", () => {
    // ownerOverride is annotation-only; the cascade must re-project time freely (not anchor like a recorded event).
    const baseSettings = aSettings({
      wakeWindowsMinutes: [120, 135],
      defaultNapLengthMinutes: 60,
      bedtimeThreshold: 23 * 60,
    });
    // Baseline: no overrides at all.
    const baseline = run(
      aContext({
        day: aDay({ wakeTime: 7 * 60 }),
        settings: baseSettings,
        actuals: [],
      }),
    );
    const baselineNaps = baseline
      .filter((e) => e.type === "nap")
      .sort((a, b) => a.startTime - b.startTime);
    const baselineNap1Start = baselineNaps[0]!.startTime;
    const baselineNap1Lifecycle = baselineNaps[0]!.lifecycle.state;

    // With override: same setup + nap_1 owner override.
    const withOverride = run(
      aContext({
        day: aDay({
          wakeTime: 7 * 60,
          ownerOverrides: { nap_1: PARENT2 },
        }),
        settings: baseSettings,
        actuals: [],
      }),
    );
    const naps = withOverride
      .filter((e) => e.type === "nap")
      .sort((a, b) => a.startTime - b.startTime);

    expect(naps[0]!.owner).toEqual(PARENT2);
    expect(naps[0]!.startTime).toBe(baselineNap1Start);
    expect(naps[0]!.lifecycle.state).toBe(baselineNap1Lifecycle);
  });

  it("null in the map = explicit NO_OWNER (beats template default)", () => {
    const ctx = aContext({
      day: aDay({
        wakeTime: 7 * 60,
        ownerOverrides: { nap_1: null },
      }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({ napOwners: [PARENT1, PARENT1] }),
      actuals: [],
    });

    const out = run(ctx);
    const nap1 = out.find((e) => e.eventKey === "nap_1");
    expect(nap1?.owner).toEqual(NO_OWNER);
  });

  it("recorded events are not touched (reality-wins)", () => {
    const recordedNap = aRecordedNap({
      eventKey: "nap_1",
      startTime: 9 * 60,
      endTime: 10 * 60,
      owner: PARENT1,
    });
    const ctx = aContext({
      day: aDay({
        wakeTime: 7 * 60,
        ownerOverrides: { nap_1: PARENT2 },
      }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({}),
      actuals: [recordedNap],
    });

    const out = run(ctx);
    const nap1 = out.find((e) => e.eventKey === "nap_1");
    expect(nap1?.owner).toEqual(PARENT1); // recorded owner untouched
  });

  it("no-ops when Day.ownerOverrides is undefined", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }), // no ownerOverrides
      settings: aSettings({
        wakeWindowsMinutes: [120, 135],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 23 * 60,
      }),
      template: aTemplate({ napOwners: [PARENT1, PARENT1] }),
      actuals: [],
    });

    const out = run(ctx);
    const nap1 = out.find((e) => e.eventKey === "nap_1");
    const nap2 = out.find((e) => e.eventKey === "nap_2");
    expect(nap1?.owner).toEqual(PARENT1);
    expect(nap2?.owner).toEqual(PARENT1);
  });
});
