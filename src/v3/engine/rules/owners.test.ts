/**
 * R12.x — Template-driven owner inheritance.
 *
 * Tests-first per CLAUDE.md TDD protocol.
 *
 * Coverage in this file:
 *   R12.1 — recorded events keep their owner (delegated to §0 reality-wins
 *           guard; we verify a recorded nap with its own owner is unchanged
 *           by an opposing template entry)
 *   R12.2 — projected naps inherit template.napOwners[N-1]
 *   R12.3 — projected wake windows inherit template.wakeWindowOwners[N-1]
 *           (NOT from same-index nap)
 *   R12.5 — projected bedtime inherits template.bedtimeOwner
 *   R12.6 — projected bottles inherit template.bottleOwners[N-1] in
 *           chronological order
 *
 * Out of scope here (covered elsewhere):
 *   R12.4 — putdown owner = parent's owner (render-only via hasPutdown)
 *   R12.7 — drawer "no owner" omits field (UI concern)
 *   R12.8 — pump owner = pumpOwnerSlot (R9), dream feed = opposite-of-bedtime (R8)
 *   R12.9 — explicit non-inheritors
 */

import { describe, expect, it } from "vitest";
import {
  PARENT1,
  PARENT2,
  aContext,
  aDay,
  aRecordedNap,
  aSettings,
  aTemplate,
  otherOwner,
} from "../../__tests__/factories";
import type { Context, Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { projectDay } from "../projectDay";
import { ALL_RULES } from "./index";

const ALL: Rule[] = [...ALL_RULES];

/**
 * `Context.template` is optional; the spread into a ProjectInput must use
 * conditional inclusion (rather than `template: ctx.template`) so the
 * `exactOptionalPropertyTypes: true` setting accepts the call. Encapsulating
 * the call once keeps each test focused on the assertion.
 */
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
    expect(naps[2]!.owner).toBeUndefined();
    expect(naps[3]!.owner).toBeUndefined();
  });

  it("sparse napOwners (undefined slot in middle) → that nap has no owner; neighbors do", () => {
    // Templates can carry sparse owner lists when a user assigns
    // nap_3's owner before nap_2's. Since cleanup §1.6, the schema
    // models this honestly as `(OwnerRef | undefined)[]` and the
    // engine must skip undefined slots without stamping `undefined`
    // onto the event.
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
    expect(naps[1]!.owner).toBeUndefined();
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
    expect(naps.every((n) => n.owner === undefined)).toBe(true);
  });
});

describe("R12.1 — clearing is deliberate: cleared owner is not re-stamped", () => {
  it("recorded nap with no owner + template entry → owner stays undefined", () => {
    // Per R12.1: "If the user explicitly cleared owner (the field is
    // omitted), the template still does NOT re-stamp." A recorded
    // (completed) event with no owner is the user's deliberate clear.
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
    expect(napTwo?.owner).toBeUndefined(); // template did NOT re-stamp
  });

  it("overridden projection is NOT re-stamped (deliberate user-edit choice persists)", () => {
    // An `overridden` lifecycle is a user owner-edit on a still-future
    // projection. If the user explicitly cleared owner on a projection
    // (overridden + owner: undefined), the template must not re-stamp.
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
      // owner omitted — user explicitly cleared via drawer
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
    expect(napTwo?.owner).toBeUndefined();
    expect(napTwo?.lifecycle.state).toBe("recorded");
  });
});

describe("R12.x — eventKey index parsing rejects malformed keys", () => {
  it("an event with eventKey 'nap_1abc' (non-strict numeric suffix) gets no template owner", () => {
    // Defensive: parseInt('1abc', 10) returns 1, which would otherwise
    // map to napOwners[0]. Strict parser rejects mixed-suffix keys.
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
    expect(found?.owner).toBeUndefined();
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
    // The other naps (1, 3, 4) all inherit PARENT2 from the template.
    const others = out.filter((e) => e.type === "nap" && e.id !== recorded.id);
    expect(others.every((n) => n.owner !== undefined && n.owner.slot === "parent2")).toBe(true);
  });
});

describe("R12.3 — projected wake_windows inherit template.wakeWindowOwners[N-1] only", () => {
  it("wake_windows take their owner from the template list, NOT from same-index nap", () => {
    // napOwners and wakeWindowOwners diverge intentionally — a future
    // bug would silently substitute napOwners for missing WW entries.
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

    // Under the physiology cascade, additional wake windows emit past
    // wws.length via cadence-extension. We assert the first 4 (the
    // ones the template covers) carry the template owner; cadence-
    // extended WWs beyond the template list naturally have no owner.
    const wws = out
      .filter((e) => e.type === "wake_window")
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 4);
    expect(wws).toHaveLength(4);
    expect(wws.every((w) => w.owner !== undefined && w.owner.slot === "parent2")).toBe(true);
    // Sanity: naps in the template-covered slots did NOT bleed into
    // the WW owner choice.
    const naps = out.filter((e) => e.type === "nap").slice(0, 4);
    expect(naps.every((n) => n.owner !== undefined && n.owner.slot === "parent1")).toBe(true);
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
    expect(wws.every((w) => w.owner === undefined)).toBe(true);
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
    expect(bedtime?.owner).toBeUndefined();
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
    expect(bottles.every((b) => b.owner === undefined)).toBe(true);
  });
});
