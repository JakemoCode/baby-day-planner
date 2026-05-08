/**
 * R9.x — Pump rules.
 *
 * Tests-first per CLAUDE.md TDD protocol.
 */

import { describe, expect, it } from "vitest";
import { aContext, aDay, aSettings } from "../../__tests__/factories";
import type { Event } from "../../schemas";
import type { Rule } from "../evaluator";
import { projectDay } from "../projectDay";
import { RULES as PUMP_RULES } from "./pumps";

const ALL: Rule[] = [...PUMP_RULES];

function aRecordedPump(start: number, eventKey: string): Event {
  return {
    id: `actual_${eventKey}`,
    dayId: "day_test",
    eventKey,
    type: "pump",
    kind: "instant",
    startTime: start,
    label: "Pump",
    hasPutdown: false,
    lifecycle: { state: "completed", committedAt: start },
  };
}

describe("R9.1 / R9.3 — pumps from settings.pumpTimes, first anchored to wakeTime", () => {
  it("with pumpTimes=[10:30, 14:30] and wakeTime=7:00, projects at 7:00 and 14:30", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        pumpTimes: [10 * 60 + 30, 14 * 60 + 30],
        pumpOwnerSlot: "parent2",
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

    const pumps = out.filter((e) => e.type === "pump").sort((a, b) => a.startTime - b.startTime);

    expect(pumps).toHaveLength(2);
    expect(pumps[0]!.startTime).toBe(7 * 60); // first anchored to wake
    expect(pumps[1]!.startTime).toBe(14 * 60 + 30);
    expect(pumps.every((p) => p.kind === "instant")).toBe(true);
    expect(pumps.every((p) => p.lifecycle.state === "projected")).toBe(true);
    expect(pumps.every((p) => p.owner !== undefined && p.owner.slot === "parent2")).toBe(true);
  });
});

describe("R9.4 — actual pump replaces projected at same eventKey", () => {
  it("with an actual pump at 07:00, the projected 07:00 is suppressed (no duplicate)", () => {
    // Settings put pumps at [10:30, 14:30]; R9.3 retargets the first to
    // 7:00. An actual pump at eventKey "pump_07:00" should suppress the
    // projection.
    const recorded = aRecordedPump(7 * 60, "pump_07:00");

    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({
        pumpTimes: [10 * 60 + 30, 14 * 60 + 30],
        pumpOwnerSlot: "parent2",
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

    const pumps = out.filter((e) => e.type === "pump");
    expect(pumps).toHaveLength(2); // recorded 7:00 + projected 14:30
    const sevenAm = pumps.filter((p) => p.startTime === 7 * 60);
    expect(sevenAm).toHaveLength(1);
    expect(sevenAm[0]!.id).toBe(recorded.id); // the recorded one wins
    expect(sevenAm[0]!.lifecycle.state).toBe("completed");
  });
});

describe("R9.1 — eventKey deduplication across collisions", () => {
  it("collapses pump targets that share an eventKey (duplicate settings or wake==entry)", () => {
    // Two collision cases in one scenario:
    //   - Settings entry [9:00] equals wakeTime 9:00 → both want eventKey 'pump_09:00'.
    //   - Settings has 14:30 listed twice → second wants the same eventKey.
    // Expected: one pump at 09:00, one at 14:30. No dup ids, no dup keys.
    const ctx = aContext({
      day: aDay({ wakeTime: 9 * 60 }),
      settings: aSettings({
        pumpTimes: [9 * 60, 14 * 60 + 30, 14 * 60 + 30],
        pumpOwnerSlot: "parent2",
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

    const pumps = out.filter((e) => e.type === "pump");
    expect(pumps).toHaveLength(2);
    expect(new Set(pumps.map((p) => p.id)).size).toBe(2);
    expect(new Set(pumps.map((p) => p.eventKey)).size).toBe(2);
    expect(pumps.map((p) => p.startTime).sort((a, b) => a - b)).toEqual([9 * 60, 14 * 60 + 30]);
  });
});

describe("R9.1 — empty pumpTimes emits nothing", () => {
  it("no pumps in settings → no pump events emitted", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ pumpTimes: [] }),
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

    expect(out.filter((e) => e.type === "pump")).toHaveLength(0);
  });
});
