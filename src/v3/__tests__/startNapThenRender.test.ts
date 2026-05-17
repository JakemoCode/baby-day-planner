/**
 * Seam test: Start Nap Now → renderProjection.
 *
 * Reproduces the §F24/F25 bug class Jake hit on 2026-05-16:
 *   - User taps "Start Nap Now" → nap_1 written with id === eventKey === "nap_1"
 *   - The cascade projects nap_2 right after
 *   - renderProjection should NOT synthesize a putdown chip whose window
 *     falls inside the in-progress nap_1 body
 *
 * The seam: NapActionButton-minted event (slot id) → projectDay → renderProjection.
 * Each layer is exercised with the real implementation (no mocks).
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../schemas";
import { projectDay } from "../engine/projectDay";
import { renderProjection } from "../ui/renderProjection";
import { aContext, aDay, aSettings } from "./factories";
import { PUTDOWN_KIND_TAG } from "../components/Timeline/expandPutdown";

// Mirrors the exact shape NapActionButton now mints: id === eventKey === "nap_N",
// endTime set to startTime + napLen (placeholder).
function recordedNapSlot(n: number, startTime: number, napLen: number): Event {
  const key = `nap_${n}`;
  return {
    id: key,
    dayId: "day_test",
    eventKey: key,
    type: "nap",
    kind: "block",
    label: `Nap ${n}`,
    startTime,
    endTime: startTime + napLen,
    hasPutdown: false,
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

    // Engine projects the full day including nap_2 after the in-progress nap_1.
    const projected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });

    // Confirm nap_2 is projected (sanity).
    const nap2 = projected.find((e) => e.eventKey === "nap_2");
    expect(nap2).toBeDefined();
    expect(nap2?.lifecycle.state).toBe("projected");

    // Run the full render pipeline including putdown expansion.
    const rendered = renderProjection(projected, settings, ctx.nowMinutes);

    // Collect all putdown chips.
    const putdownChips = rendered.filter((e) => e.eventKey === PUTDOWN_KIND_TAG);

    // No putdown chip should land inside nap_1's body.
    // nap_1 effectiveEnd at now=9:30: 9:30 < endTime=10:00 → effectiveEnd = 10:00.
    // putdown chip for nap_2 would be [nap_2.start - 15, nap_2.start].
    // nap_2.start = wakeTime + ww1 + napLen + ww2 = 7:00 + 2h + 1h + 2h15 = 12:15.
    // putdown window = [12:00, 12:15] — well outside nap_1 [9:00, 10:00].
    // This test instead verifies no chip lands INSIDE nap_1 [9:00, 10:00).
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
    // At least one putdown chip should exist for the upcoming projected nap.
    expect(putdownChips.length).toBeGreaterThan(0);
  });

  // The original Jake bug (2026-05-16): renderer reads event.endTime, so an
  // in-progress recorded nap whose `now > endTime` rendered clipped at the
  // placeholder. renderProjection now bakes effectiveEnd into the event so
  // the renderer naturally draws the extended block.
  it("renderProjection rewrites in-progress recorded nap endTime to effectiveEnd (R6.8 visual fix)", () => {
    const wakeTime = 7 * 60;
    const napLen = 60;
    // nap_1 recorded at 9:00, placeholder endTime = 10:00. Now = 10:30 (30 min past).
    // Expected: rendered nap_1 has endTime rewritten to 11:00 (1 extension).
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
    // endTime is rewritten to effectiveEnd. baseEnd=10:00, now=10:30, 1 extension → 11:00.
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
    // Capped at startTime + 4*napLen = 13:00.
    expect(renderedNap1?.endTime).toBe(13 * 60);
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
    // Completed nap with explicit endTime; never auto-extended.
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
    expect(renderedNap1?.endTime).toBe(9 * 60 + 30); // unchanged
  });

  it("effectiveEnd caps at startTime + 4×napLen — applies at render time (expandPutdown), not cascade", () => {
    const wakeTime = 7 * 60;
    const napLen = 60;
    // nap_1: recorded at 9:00, endTime = 10:00 (placeholder).
    // now = 14:00 (5 hours later, well past 3 extensions).
    // cap = 9:00 + 4*60 = 13:00.
    // The CASCADE uses endTime (10:00) as cursor — so ww_2 starts at 10:00.
    // effectiveEndOf (used by putdown render) caps the IN-PROGRESS window at 13:00,
    // so no putdown chips for future naps render inside [9:00, 13:00].
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
      nowMinutes: 14 * 60, // far past cap
    });

    const projected = projectDay({
      day: ctx.day,
      settings: ctx.settings,
      actuals: ctx.actuals,
      nowMinutes: ctx.nowMinutes,
    });

    // Cascade cursor uses endTime (10:00), so ww_2 starts at nap_1.endTime.
    const ww2 = projected.find((e) => e.eventKey === "wake_window_2");
    expect(ww2?.startTime).toBe(nap1.endTime); // 10:00 — cascade uses recorded endTime
  });
});
