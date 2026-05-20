/**
 * Seam test for the 2026-05-20 bug Jake hit:
 *
 *   1. Nap 1 is projected at 8:35–9:20 (45min, default napLen).
 *   2. Daycare dropoff projected at 8:30 (no nap conflict yet).
 *   3. User opens nap drawer, slides start to 8:25.
 *      Drawer preserves duration → endTime = 9:10. Drawer always sets
 *      endTime (the form has start + end fields), distinguishing this
 *      case from "Start Nap Now" (which omits endTime to signal
 *      in-progress / auto-extend).
 *   4. Engine sees the recorded nap [8:25, 9:10] in actuals.
 *      R21.2 detects daycare at 8:30 falls inside → shifts to 9:10.
 *   5. Renderer asks effectiveEndOf for the nap's visual end → 9:10
 *      (recorded WITH endTime bypasses auto-extend; recorded WITHOUT
 *      endTime is the only path that auto-extends past placeholder).
 *
 * Exercises the whole chain so a regression in any of the three
 * components (NapActionButton's no-endTime convention, effectiveEndOf's
 * gate, R21.2's shift) gets caught.
 */

import { describe, expect, it } from "vitest";
import { effectiveEndOf } from "../lib/effectiveEnd";
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

  it("drawer save of a nap keeps lifecycle = recorded (scheduling intent preserves hasPutdown)", () => {
    // The lifecycle reducer keeps scheduling-type drawer saves in
    // `recorded` so deriveHasPutdown still emits putdown markers. The
    // bug fix is NOT here — it's in effectiveEndOf, which now gates
    // auto-extend on `endTime === undefined` instead of lifecycle state.
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
    // Pre-fix: effectiveEndOf auto-extended any recorded nap whose endTime
    // was past `now`, capping at startTime+4×napLen. For Jake's nap edit
    // (8:25 start, 9:10 endTime, now 11:00), this returned 11:25 (cap),
    // visually swallowing the daycare chip R21.2 had shifted to 9:10.
    //
    // Post-fix: recorded WITH endTime → return endTime directly. Recorded
    // WITHOUT endTime ("Start Nap Now, waiting for End Nap") is the ONLY
    // path that still auto-extends. NapActionButton.Start omits endTime;
    // drawer save always sets it.
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
    expect(effectiveEndOf(editedNap, napLen, NOW)).toBe(9 * 60 + 10);
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
      // Drawer-saved nap: recorded + endTime set. effectiveEndOf
      // returns endTime (no auto-extend) because endTime is present.
      lifecycle: { state: "recorded", annotatedAt: NOW },
    };
    const ctx = aContext({
      day: aDay({ wakeTime: 7 * 60, date: "2026-05-08" }),
      actuals: [editedNap],
      nowMinutes: NOW,
      settings: aSettings({
        wakeWindowsMinutes: [95, 100, 110, 120, 120, 120],
        defaultNapLengthMinutes: napLen,
        bottleChain: { bottlesPerDay: 0, bufferAfterWakeMinutes: 10 },
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

    // And the rendered visual extent of the nap is its raw endTime —
    // the renderer should match what the engine used to shift daycare.
    expect(effectiveEndOf(editedNap, napLen, NOW)).toBe(9 * 60 + 10);
  });
});
