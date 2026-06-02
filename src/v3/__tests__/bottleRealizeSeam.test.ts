/**
 * Seam test (2026-06-02 Jake prod bug): editing a projected bottle and recording it
 * ("Log now" / time-edit) must MOVE the bottle, not spawn a duplicate beside the
 * stranded forecast. Exercises the REAL write path (useDrawer.onSave: realize tag +
 * re-ID) feeding the REAL engine (projectDay: realize/relocate absorption). Either
 * layer alone passes its unit tests; the duplicate lived at the join (BOTTLE_SPEC §4).
 */

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { projectDay } from "../engine/projectDay";
import { ALL_RULES } from "../engine/rules";
import { useDrawer } from "../hooks/useDrawer";
import { aContext, aDay, aSettings } from "./factories";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";

// Wake 7:00, buffer 10, interval 180 ⇒ natural forecast slot at 16:10; "now" 16:20.
const NOW = 16 * 60 + 20;

function ctxWith(actuals: Event[]) {
  return aContext({
    day: aDay({ wakeTime: 7 * 60 }),
    settings: aSettings({
      bottleChain: { bottlesPerDay: 4, bufferAfterWakeMinutes: 10 },
      defaultBottleIntervalMinutes: 180,
    }),
    nowMinutes: NOW,
    actuals,
  });
}

function bottleTimes(actuals: Event[]): number[] {
  const ctx = ctxWith(actuals);
  return projectDay(
    { day: ctx.day, settings: ctx.settings, actuals: ctx.actuals, nowMinutes: ctx.nowMinutes },
    { rules: [...ALL_RULES] },
  )
    .filter((e) => e.type === "bottle")
    .map((b) => b.startTime)
    .sort((a, b) => a - b);
}

function projectedBottleAt(startTime: number): Event {
  return {
    id: `proj_bottle_t${startTime}`,
    dayId: "day_test",
    eventKey: "bottle_1",
    type: "bottle",
    kind: "instant",
    label: "Bottle 4",
    startTime,
    amountOz: 4,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "projected" },
  };
}

describe("seam: edit a forecast bottle → record → one bottle, not two", () => {
  it("Log now (16:10 forecast → record at 16:30) moves the bottle, no stranded 16:10 forecast", async () => {
    const projected = projectedBottleAt(16 * 60 + 10);
    const saveEvent = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDrawer({ actuals: [], saveEvent, deleteOptimistic: vi.fn(), suppressions: [] }),
    );

    act(() => result.current.openEdit(projected));
    await act(async () => {
      // "Log now": startTime → 16:30, lifecycle completed (as formToEvent yields).
      await result.current.onSave({
        ...projected,
        startTime: 16 * 60 + 30,
        lifecycle: { state: "completed", committedAt: NOW },
      });
    });

    const recorded = saveEvent.mock.calls[0]![0] as Event;
    expect(recorded.realizedForecast).toBe(true);

    const times = bottleTimes([recorded]);
    expect(times).toContain(16 * 60 + 30);
    expect(times).not.toContain(16 * 60 + 10);
  });
});
