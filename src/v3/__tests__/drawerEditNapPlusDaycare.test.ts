/**
 * Seam test: drawer nap edit (with endTime) + R21.2 daycare overlap shift.
 * Covers NapActionButton no-endTime convention, effectiveEndOf gate, and R21.2 shift.
 */

import { describe, expect, it } from "vitest";
import { resolvedEnd } from "../lib/effectiveEnd";
import { reduceLifecycle } from "../lifecycle";
import { ALL_RULES } from "../engine/rules";
import { projectDay } from "../engine/projectDay";
import { aContext, aDay, aSettings } from "./factories";
import { NO_OWNER, type Context, type Event, type WeekdayFlags } from "../schemas";

const ALL_DAYS_TRUE: WeekdayFlags = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
};

function run(ctx: Context): Event[] {
  return projectDay(
    {
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
      ...(ctx.template !== undefined ? { template: ctx.template } : {}),
    },
    { rules: [...ALL_RULES] },
  );
}

describe("drawer-edit nap + daycare overlap (2026-05-20 Jake bug)", () => {
  const napLen = 45;
  const NOW = 11 * 60; // current wall-clock, well past nap end
  const napSettings = aSettings({ defaultNapLengthMinutes: napLen });

  it("drawer save of a nap keeps lifecycle = recorded (scheduling intent preserves hasPutdown)", () => {
    // Fix lives in effectiveEndOf (gates auto-extend on endTime===undefined, not lifecycle).
    const next = reduceLifecycle(
      { state: "projected" },
      {
        type: "DRAWER_SAVE",
        eventType: "nap",
        eventKind: "block",
        timeChanged: true,
        hasEndTime: true,
        nowMinutes: NOW,
      },
    );
    expect(next.state).toBe("recorded");
  });

  it("a RECORDED nap WITH endTime does NOT auto-extend past it (the actual fix)", () => {
    // Pre-fix: resolvedEnd auto-extended, returning 11:25 cap and swallowing R21.2's daycare shift.
    // Post-fix: recorded WITH endTime returns endTime directly; only recorded WITHOUT endTime auto-extends.
    const editedNap: Event = {
      id: "rec_nap_1",
      dayId: "d1",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 8 * 60 + 25,
      endTime: 9 * 60 + 10,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "recorded", annotatedAt: NOW },
    };
    expect(resolvedEnd(editedNap, napSettings, NOW)).toBe(9 * 60 + 10);
  });

  it("end-to-end: edited nap + daycare overlap → daycare shifts to nap.endTime; nap stays 8:25–9:10", () => {
    const editedNap: Event = {
      id: "rec_nap_1",
      dayId: "d1",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 8 * 60 + 25,
      endTime: 9 * 60 + 10,
      hasPutdown: false,
      owner: NO_OWNER,
      // Drawer-saved: recorded + endTime set → resolvedEnd returns endTime directly.
      lifecycle: { state: "recorded", annotatedAt: NOW },
    };
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      actuals: [editedNap],
      nowMinutes: NOW,
      settings: aSettings({
        wakeWindowsMinutes: [95, 100, 110, 120, 120, 120],
        defaultNapLengthMinutes: napLen,
        bottleChain: { bufferAfterWakeMinutes: 10 },
        daycare: {
          enabled: true,
          dropoffTime: 8 * 60 + 30, // inside [8:25, 9:10)
          pickupTime: 17 * 60 + 30,
          weekdays: ALL_DAYS_TRUE,
        },
      }),
    });
    const out = run(ctx);
    const dropoff = out.find((e) => e.type === "daycare_dropoff");
    expect(dropoff?.startTime).toBe(9 * 60 + 10);

    // Rendered visual extent must match what the engine used to shift daycare.
    expect(resolvedEnd(editedNap, ctx.settings, NOW)).toBe(9 * 60 + 10);
  });
});
