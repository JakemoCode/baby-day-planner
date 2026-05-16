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

// Mirrors the exact shape NapActionButton now mints: id === eventKey === "nap_1".
function startedNapSlot(n: number, startTime: number): Event {
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
    lifecycle: { state: "started", committedAt: startTime },
  };
}

describe("seam: Start Nap Now → renderProjection", () => {
  it("no putdown chip inside an in-progress nap_1 when nap_2 is projected after it", () => {
    const wakeTime = 7 * 60; // 7:00 AM
    // nap_1 started at 9:00 (no endTime yet — in progress)
    const nap1Started = startedNapSlot(1, 9 * 60);

    const settings = aSettings({
      defaultNapLengthMinutes: 60,
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
    // nap_1 soft-end: 9:00 + 60 = 10:00. Any putdown chip with startTime in [9:00, 10:00) is the bug.
    const nap1SoftEnd = nap1Started.startTime + settings.defaultNapLengthMinutes;
    const chipsInsideNap1 = putdownChips.filter(
      (chip) => chip.startTime >= nap1Started.startTime && chip.startTime < nap1SoftEnd,
    );
    expect(chipsInsideNap1).toHaveLength(0);
  });

  it("allows putdown chip for a future nap when no in-progress sleep exists", () => {
    const wakeTime = 7 * 60;
    const settings = aSettings({
      defaultNapLengthMinutes: 60,
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
});
