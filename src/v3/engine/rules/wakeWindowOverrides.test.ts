/**
 * R4.2 — Wake window owner override.
 *
 * Merges owner/label from a recorded wake_window doc onto the cascade-derived projection;
 * drops the override doc so a single wake_window renders per slot. Time always comes from
 * the cascade (predict-don't-prescribe).
 */

import { describe, expect, it } from "vitest";
import { PARENT1, PARENT2, aContext, aDay, aSettings, aTemplate } from "../../__tests__/factories";
import type { Context, Event, OwnerRef } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { projectDay } from "../projectDay";
import { ALL_RULES } from "./index";
import { RULES as R4_2_RULES } from "./wakeWindowOverrides";

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
    lifecycle: { state: "recorded", annotatedAt: 0 },
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
    // ww_2 may be past nowMinutes=12:00 → auto-promoted; lifecycle follows time-vs-now rule.
    expect(
      ww2[0]!.startTime <= ctx.nowMinutes
        ? ww2[0]!.lifecycle.state === "recorded"
        : ww2[0]!.lifecycle.state === "projected",
    ).toBe(true);
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

    expect(ww1?.owner).toEqual(PARENT2); // template where no override
    expect(ww2?.owner).toEqual(PARENT1); // override wins
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
    // Override doc has startTime=0/endTime=0; R3.1 computes real times from wakeTime.
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
    // wake_window_99 has no matching cascade projection; must be dropped without crashing.
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 150] }),
      actuals: [wakeWindowOverride("wake_window_99", PARENT1)],
    });

    const out = run(ctx);

    const stray = out.find((e) => e.eventKey === "wake_window_99");
    expect(stray).toBeUndefined();
    expect(out.find((e) => e.eventKey === "wake_window_1")).toBeDefined();
    expect(out.find((e) => e.eventKey === "wake_window_2")).toBeDefined();
  });

  it("assertAfter fires when a recorded wake_window survives R4.2 (regression guard)", () => {
    // If a bug lets a recorded wake_window leak into output, assertAfter catches it before R3.1 is corrupted.
    const orphan: Event = {
      id: "orphan_ww",
      dayId: "day_test",
      eventKey: "wake_window_1",
      type: "wake_window",
      kind: "block",
      startTime: 7 * 60,
      endTime: 9 * 60,
      label: "Wake window 1",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: 7 * 60 },
    };
    const rule = R4_2_RULES[0];
    if (!rule?.assertAfter) throw new Error("R4.2 rule must define assertAfter");
    const ctx = aContext({});
    const result = rule.assertAfter([orphan], ctx);
    expect(result).toContain("R4.2 invariant violated");
    expect(result).toContain("wake_window_1");
  });

  it("assertAfter passes when no recorded wake_windows remain", () => {
    const projected: Event = {
      id: "ww_proj",
      dayId: "day_test",
      eventKey: "wake_window_1",
      type: "wake_window",
      kind: "block",
      startTime: 7 * 60,
      endTime: 9 * 60,
      label: "Wake window 1",
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "projected" },
    };
    const rule = R4_2_RULES[0];
    if (!rule?.assertAfter) throw new Error("R4.2 rule must define assertAfter");
    const ctx = aContext({});
    expect(rule.assertAfter([projected], ctx)).toBeNull();
  });

  it("no overrides → cascade output is unchanged (regression guard)", () => {
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60 }),
      settings: aSettings({ wakeWindowsMinutes: [120, 150] }),
      actuals: [],
    });

    const out = run(ctx);

    const wakeWindows = out.filter((e) => e.type === "wake_window");
    expect(wakeWindows.length).toBeGreaterThanOrEqual(2);
    expect(wakeWindows.every((e) => e.owner.slot === "none")).toBe(true);
  });
});
