/**
 * R4.2 — Wake window owner override.
 *
 * V2 had `applyWakeWindowOverrides` (silently dropped in the V3 cutover).
 * Restored 2026-05-12 per Jake: "wake window owners should absolutely be
 * retained when the day recalculates."
 *
 * V3-native shape: the user picks an owner on a projected wake_window;
 * the UI persists an Event doc with `lifecycle.state: 'overridden'` and
 * `type: 'wake_window'`. The engine reads that doc from `ctx.actuals`,
 * merges metadata (owner, label) onto the cascade-derived projection,
 * then drops the override doc so a single wake_window renders per slot.
 *
 * Time stays from R3.1 (predict-don't-prescribe) — a stale override's
 * timestamp does not pin geometry. Owner-only stickiness is the point.
 */

import { describe, expect, it } from "vitest";
import { PARENT1, PARENT2, aContext, aDay, aSettings, aTemplate } from "../../__tests__/factories";
import type { Context, Event, OwnerRef } from "../../schemas";
import { projectDay } from "../projectDay";
import { ALL_RULES } from "./index";

function run(ctx: Context): Event[] {
  return projectDay(
    {
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      ...(ctx.template ? { template: ctx.template } : {}),
      nowMinutes: ctx.nowMinutes,
    },
    { rules: ALL_RULES },
  );
}

function wakeWindowOverride(eventKey: string, owner: OwnerRef, label?: string): Event {
  return {
    id: `override_${eventKey}`,
    dayId: "day_test",
    eventKey,
    type: "wake_window",
    kind: "block",
    startTime: 0, // ignored — R3.1 owns time
    endTime: 0,
    label: label ?? `Wake window override ${eventKey}`,
    owner,
    hasPutdown: false,
    lifecycle: { state: "overridden", annotatedAt: 0 },
  };
}

describe("R4.2 — wake_window owner overrides survive recompute", () => {
  it("an overridden wake_window_2 owner is applied to the cascade-derived projection", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 150, 180] }),
      actuals: [wakeWindowOverride("wake_window_2", PARENT1)],
    });

    const out = run(ctx);

    const ww2 = out.filter((e) => e.eventKey === "wake_window_2");
    // Exactly one wake_window_2 in output (override doc dropped, projection kept).
    expect(ww2).toHaveLength(1);
    expect(ww2[0]!.owner).toEqual(PARENT1);
    expect(ww2[0]!.lifecycle.state).toBe("projected");
  });

  it("override beats template — final owner is the override, not the template", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 150, 180] }),
      template: aTemplate({ wakeWindowOwners: [PARENT2, PARENT2, PARENT2] }),
      actuals: [wakeWindowOverride("wake_window_2", PARENT1)],
    });

    const out = run(ctx);

    const ww1 = out.find((e) => e.eventKey === "wake_window_1");
    const ww2 = out.find((e) => e.eventKey === "wake_window_2");
    const ww3 = out.find((e) => e.eventKey === "wake_window_3");

    // Template applies where there's no override.
    expect(ww1?.owner).toEqual(PARENT2);
    // Override wins for wake_window_2.
    expect(ww2?.owner).toEqual(PARENT1);
    expect(ww3?.owner).toEqual(PARENT2);
  });

  it("override carries label onto the projection", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 150] }),
      actuals: [wakeWindowOverride("wake_window_1", PARENT1, "Pre-school walk")],
    });

    const out = run(ctx);

    const ww1 = out.find((e) => e.eventKey === "wake_window_1");
    expect(ww1?.label).toBe("Pre-school walk");
  });

  it("override time is IGNORED — cascade-derived time wins (predict-don't-prescribe)", () => {
    // The override doc carries startTime: 0 / endTime: 0, intentionally
    // bogus. R3.1's cascade should compute real times anchored at wakeTime.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120] }),
      actuals: [wakeWindowOverride("wake_window_1", PARENT1)],
    });

    const out = run(ctx);

    const ww1 = out.find((e) => e.eventKey === "wake_window_1");
    expect(ww1?.startTime).toBe(7 * 60); // anchored at wake, not 0
    expect(ww1?.endTime).toBe(7 * 60 + 120); // cascade + 120 min, not 0
  });

  it("override for a non-existent wake_window slot is dropped silently", () => {
    // wakeWindowsMinutes has 2 entries → projection emits wake_window_1, _2.
    // Override for wake_window_99 has no matching projection; should not
    // appear in output and should not crash.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 150] }),
      actuals: [wakeWindowOverride("wake_window_99", PARENT1)],
    });

    const out = run(ctx);

    const stray = out.find((e) => e.eventKey === "wake_window_99");
    expect(stray).toBeUndefined();
    // Cascade still produces wake_window_1 and wake_window_2.
    expect(out.find((e) => e.eventKey === "wake_window_1")).toBeDefined();
    expect(out.find((e) => e.eventKey === "wake_window_2")).toBeDefined();
  });

  it("no overrides → cascade output is unchanged (regression guard)", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 150] }),
      actuals: [],
    });

    const out = run(ctx);

    const wakeWindows = out.filter((e) => e.type === "wake_window");
    expect(wakeWindows).toHaveLength(2);
    expect(wakeWindows.every((e) => e.owner === undefined)).toBe(true);
  });
});
