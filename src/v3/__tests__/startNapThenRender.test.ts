/**
 * Seam test: Start Nap Now → renderProjection (§F24/F25).
 * No mocks; covers putdown suppression inside in-progress nap and effectiveEnd rewriting.
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";
import { projectDay } from "../engine/projectDay";
import { renderProjection } from "../ui/renderProjection";
import { aContext, aDay, aSettings } from "./factories";
import { PUTDOWN_KIND_TAG } from "../components/Timeline/expandPutdown";

// "Start Nap Now" shape: recorded + no endTime; effectiveEndOf auto-extends until End Nap is tapped.
// napLen param unused (kept for call-site stability); placeholder derives from settings.
function recordedNapSlot(n: number, startTime: number, _napLen: number): Event {
  const key = `nap_${n}`;
  return {
    id: key,
    dayId: "day_test",
    eventKey: key,
    type: "nap",
    kind: "block",
    label: `Nap ${n}`,
    startTime,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: startTime },
  };
}

/** Drawer-saved fixture: recorded + committed endTime (no auto-extend). */
function drawerSavedNapSlot(n: number, startTime: number, endTime: number): Event {
  const key = `nap_${n}`;
  return {
    id: key,
    dayId: "day_test",
    eventKey: key,
    type: "nap",
    kind: "block",
    label: `Nap ${n}`,
    startTime,
    endTime,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: startTime },
  };
}

describe("seam: Start Nap Now → renderProjection", () => {
  it("no putdown chip inside an in-progress nap_1 when nap_2 is projected after it", () => {
    const wakeTime = 7 * 60; // 7:00 AM
    const napLen = 60;
    // nap_1 started at 9:00, placeholder endTime = 10:00
    const nap1Started = recordedNapSlot(1, 9 * 60, napLen);

    const settings = aSettings({
      defaultNapLengthMinutes: napLen,
      putdownLeadMinutes: 15,
      wakeWindowsMinutes: [120, 135],
      bedtimeThreshold: 19 * 60,
      defaultWakeTime: wakeTime,
    });

    const day = aDay({ wakeTime });

    const ctx = aContext({
      day,
      settings,
      actuals: [nap1Started],
      nowMinutes: 9 * 60 + 30, // 30 min into the nap
    });

    const projected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });

    const nap2 = projected.find((e) => e.eventKey === "nap_2");
    expect(nap2).toBeDefined();
    expect(nap2?.lifecycle.state).toBe("projected");

    const rendered = renderProjection(projected, settings, ctx.nowMinutes);
    const putdownChips = rendered.filter((e) => e.eventKey === PUTDOWN_KIND_TAG);
    // Verify no putdown chip lands inside nap_1 [9:00, effectiveEnd).
    const nap1SoftEnd = nap1Started.startTime + napLen;
    const chipsInsideNap1 = putdownChips.filter(
      (chip) => chip.startTime >= nap1Started.startTime && chip.startTime < nap1SoftEnd,
    );
    expect(chipsInsideNap1).toHaveLength(0);
  });

  it("allows putdown chip for a future nap when no in-progress sleep exists", () => {
    const wakeTime = 7 * 60;
    const napLen = 60;
    const settings = aSettings({
      defaultNapLengthMinutes: napLen,
      putdownLeadMinutes: 15,
      wakeWindowsMinutes: [120, 135],
      bedtimeThreshold: 19 * 60,
      defaultWakeTime: wakeTime,
    });
    const day = aDay({ wakeTime });
    const ctx = aContext({
      day,
      settings,
      actuals: [],
      nowMinutes: 7 * 60 + 30, // 30 min after wake, before any nap
    });

    const projected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });

    const rendered = renderProjection(projected, settings, ctx.nowMinutes);
    const putdownChips = rendered.filter((e) => e.eventKey === PUTDOWN_KIND_TAG);
    expect(putdownChips.length).toBeGreaterThan(0);
  });

  it("renderProjection rewrites in-progress recorded nap endTime to effectiveEnd (R6.8 visual fix)", () => {
    const wakeTime = 7 * 60;
    const napLen = 60;
    // nap_1 at 9:00, placeholder endTime 10:00, now 10:30 → effectiveEnd 11:00 (1 extension).
    const nap1 = recordedNapSlot(1, 9 * 60, napLen);

    const settings = aSettings({
      defaultNapLengthMinutes: napLen,
      putdownLeadMinutes: 15,
      wakeWindowsMinutes: [120, 135],
      bedtimeThreshold: 19 * 60,
      defaultWakeTime: wakeTime,
    });
    const day = aDay({ wakeTime });
    const ctx = aContext({
      day,
      settings,
      actuals: [nap1],
      nowMinutes: 10 * 60 + 30, // 30 min past placeholder
    });

    const projected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });

    const rendered = renderProjection(projected, settings, ctx.nowMinutes);
    const renderedNap1 = rendered.find((e) => e.id === "nap_1");
    expect(renderedNap1?.endTime).toBe(11 * 60);
  });

  it("renderProjection bakes cap when nap is far past extensions", () => {
    const wakeTime = 7 * 60;
    const napLen = 60;
    const nap1 = recordedNapSlot(1, 9 * 60, napLen);

    const settings = aSettings({
      defaultNapLengthMinutes: napLen,
      putdownLeadMinutes: 15,
      wakeWindowsMinutes: [120, 135],
      bedtimeThreshold: 23 * 60,
      defaultWakeTime: wakeTime,
    });
    const day = aDay({ wakeTime });
    const ctx = aContext({
      day,
      settings,
      actuals: [nap1],
      nowMinutes: 18 * 60, // way past cap (cap = 9:00 + 4*60 = 13:00)
    });

    const projected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });

    const rendered = renderProjection(projected, settings, ctx.nowMinutes);
    const renderedNap1 = rendered.find((e) => e.id === "nap_1");
    expect(renderedNap1?.endTime).toBe(13 * 60); // cap: startTime + 4*napLen
  });

  it("renderProjection does NOT rewrite endTime for completed naps", () => {
    const wakeTime = 7 * 60;
    const napLen = 60;
    const settings = aSettings({
      defaultNapLengthMinutes: napLen,
      putdownLeadMinutes: 15,
      wakeWindowsMinutes: [120, 135],
      bedtimeThreshold: 19 * 60,
      defaultWakeTime: wakeTime,
    });
    const day = aDay({ wakeTime });
    const completedNap: Event = {
      id: "nap_1",
      dayId: "day_test",
      eventKey: "nap_1",
      type: "nap",
      kind: "block",
      label: "Nap 1",
      startTime: 9 * 60,
      endTime: 9 * 60 + 30, // user explicitly ended early
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "completed", committedAt: 9 * 60 },
    };
    const ctx = aContext({
      day,
      settings,
      actuals: [completedNap],
      nowMinutes: 14 * 60, // long after
    });

    const projected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });

    const rendered = renderProjection(projected, settings, ctx.nowMinutes);
    const renderedNap1 = rendered.find((e) => e.id === "nap_1");
    expect(renderedNap1?.endTime).toBe(9 * 60 + 30); // completed: endTime unchanged
  });

  it("effectiveEnd caps at startTime + 4×napLen — applies at render time (expandPutdown), not cascade", () => {
    const wakeTime = 7 * 60;
    const napLen = 60;
    // Drawer-saved nap (committed endTime 10:00): cascade uses endTime as cursor, not effectiveEnd.
    const nap1 = drawerSavedNapSlot(1, 9 * 60, 10 * 60);

    const settings = aSettings({
      defaultNapLengthMinutes: napLen,
      putdownLeadMinutes: 15,
      wakeWindowsMinutes: [120, 135],
      bedtimeThreshold: 19 * 60,
      defaultWakeTime: wakeTime,
    });
    const day = aDay({ wakeTime });
    const ctx = aContext({
      day,
      settings,
      actuals: [nap1],
      nowMinutes: 14 * 60, // far past cap
    });

    const projected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });

    const ww2 = projected.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe(nap1.endTime); // cascade uses committed endTime as cursor
  });
});
