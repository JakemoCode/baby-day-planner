/**
 * R6.x — Putdown rules.
 *
 * Putdown is a render-only flag (R6.1). Engine sets `hasPutdown: true` on
 * projected naps and bedtime that are still in the future relative to
 * `nowMinutes`. The renderer prepends a virtual putdown block; nothing
 * is persisted.
 *
 * Tests-first per CLAUDE.md TDD protocol.
 */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aSettings } from "../../__tests__/factories";
import type { Rule } from "../evaluator";
import { projectDay } from "../projectDay";
import { RULES as BEDTIME_RULES } from "./bedtime";
import { RULES as NAP_RULES } from "./naps";
import { RULES as PUTDOWN_RULES } from "./putdown";

const ALL: Rule[] = [...NAP_RULES, ...BEDTIME_RULES, ...PUTDOWN_RULES];

describe("R6 — hasPutdown flag on projected naps and bedtime", () => {
  it("future projected nap gets hasPutdown=true", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120] }),
      actuals: [],
      nowMinutes: 8 * 60, // 8:00, before nap_1 at 9:00
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

    const nap = out.find((e) => e.eventKey === "nap_1");
    expect(nap).toBeDefined();
    expect(nap!.hasPutdown).toBe(true);
  });

  it("hasPutdown stays true regardless of nowMinutes — renderer gates by time", () => {
    // R6.1 is now purely structural: every nap/bedtime gets hasPutdown=true.
    // The temporal "is the putdown still in the future" decision lives in
    // expandPutdownBlocks (see Timeline tests for that gate). Bundling
    // them in the engine broke owner-edit on projected naps (lifecycle
    // shifts to `overridden` and the engine used to clear hasPutdown).
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120] }),
      actuals: [],
      nowMinutes: 10 * 60, // 10:00, after nap_1 at 9:00
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

    const nap = out.find((e) => e.eventKey === "nap_1");
    expect(nap).toBeDefined();
    expect(nap!.hasPutdown).toBe(true);
  });

  it("projected bedtime in the future gets hasPutdown=true", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        wakeWindowsMinutes: [120, 135, 135, 150],
        defaultNapLengthMinutes: 60,
        bedtimeThreshold: 19 * 60,
        defaultWakeTime: 7 * 60,
      }),
      actuals: [],
      nowMinutes: 18 * 60,
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

    const bedtime = out.find((e) => e.type === "bedtime");
    expect(bedtime).toBeDefined();
    expect(bedtime!.hasPutdown).toBe(true);
  });
});
