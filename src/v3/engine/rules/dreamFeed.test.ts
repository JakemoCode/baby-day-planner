/**
 * R8.x — Dream feed rules.
 *
 * Tests-first per CLAUDE.md TDD protocol.
 */

import { describe, expect, it } from "vitest";
import {
  PARENT1,
  PARENT2,
  aContext,
  aDay,
  aProjectedBedtime,
  aRecordedBottle,
  aSettings,
  otherOwner,
} from "../../__tests__/factories";
import type { Rule } from "../evaluator";
import { projectDay } from "../projectDay";
import { RULES as BEDTIME_RULES } from "./bedtime";
import { RULES as DREAM_RULES } from "./dreamFeed";
import { RULES as NAP_RULES } from "./naps";

const ALL: Rule[] = [...NAP_RULES, ...BEDTIME_RULES, ...DREAM_RULES];

describe("R8.1 / R8.3 — dream feed projects when enabled and bedtime exists", () => {
  it("with bedtime at 19:00, offset 90, earliest 20:30, latest 21:00 → dream feed at 20:30", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
        dreamFeedEnabled: true,
        dreamFeedStart: 20 * 60 + 30,
        dreamFeedEnd: 21 * 60,
        dreamFeedOffsetAfterBedtimeMinutes: 90,
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

    const dream = out.find((e) => e.type === "dream_feed");
    expect(dream).toBeDefined();
    expect(dream!.startTime).toBe(20 * 60 + 30);
    expect(dream!.kind).toBe("instant");
    expect(dream!.lifecycle.state).toBe("projected");
    expect(dream!.label).toBe("Dream Feed");
  });
});

describe("R8.1 — disabled dream feed emits nothing", () => {
  it("emits no dream_feed when dreamFeedEnabled=false", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        bedtimeThreshold: 19 * 60,
        dreamFeedEnabled: false,
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

    expect(out.find((e) => e.type === "dream_feed")).toBeUndefined();
  });
});

describe("R8.2 — no bedtime → no dream feed", () => {
  it("emits nothing when no bedtime is in events", () => {
    // wake_windows array is empty, so no cascade and no threshold trigger.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [],
        dreamFeedEnabled: true,
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

    expect(out.find((e) => e.type === "dream_feed")).toBeUndefined();
  });
});

describe("R8.8 — dream feed owner = OPPOSITE of bedtime owner", () => {
  it("bedtime owner=parent1 → dream feed owner=parent2", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        bedtimeThreshold: 19 * 60,
        dreamFeedEnabled: true,
      }),
      actuals: [
        aProjectedBedtime({
          id: "manual_bedtime",
          start: 19 * 60,
          end: 30 * 60,
          owner: PARENT1,
          lifecycle: { state: "completed", committedAt: 19 * 60 },
        }),
      ],
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

    const dream = out.find((e) => e.type === "dream_feed");
    expect(dream).toBeDefined();
    expect(dream!.owner).toEqual(PARENT2);
  });

  it("bedtime owner=other → dream feed has no default owner", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        bedtimeThreshold: 19 * 60,
        dreamFeedEnabled: true,
      }),
      actuals: [
        aProjectedBedtime({
          id: "manual_bedtime_other",
          start: 19 * 60,
          end: 30 * 60,
          owner: otherOwner("babysitter"),
          lifecycle: { state: "completed", committedAt: 19 * 60 },
        }),
      ],
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

    const dream = out.find((e) => e.type === "dream_feed");
    expect(dream).toBeDefined();
    expect(dream!.owner).toBeUndefined();
  });
});

void aRecordedBottle;
