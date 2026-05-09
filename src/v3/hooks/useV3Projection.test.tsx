/**
 * useV3Projection — engine output as a React-friendly hook.
 *
 * Combines the V3 engine, the per-render `nowMinutes` clock, and a
 * stable subscription so the timeline re-renders every 30s while
 * actuals/settings are unchanged.
 */

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Day, Event, Settings } from "../schemas";
import { useV3Projection } from "./useV3Projection";

vi.mock("../engine/projectDay", () => ({
  projectDay: vi.fn((input) => [
    {
      id: "p-1",
      dayId: input.day.id,
      eventKey: "marker",
      type: "extra",
      kind: "instant",
      startTime: input.nowMinutes,
      label: `now=${input.nowMinutes}`,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    } satisfies Event,
  ]),
}));

vi.mock("../../hooks/useNowMinutes", () => ({
  useNowMinutes: () => 8 * 60 + 30,
}));

const day: Day = {
  id: "d-1",
  childId: "c-1",
  date: "2026-05-09",
  status: "active",
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

const settings = {
  childId: "c-1",
  defaultWakeTime: 7 * 60,
} as unknown as Settings;

describe("useV3Projection", () => {
  it("calls projectDay with the engine context derived from inputs + useNowMinutes", () => {
    const { result } = renderHook(() => useV3Projection({ day, settings, actuals: [] }));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.label).toBe("now=510");
  });

  it("threads template through when provided", async () => {
    const { projectDay } = await import("../engine/projectDay");
    const calls = vi.mocked(projectDay);
    calls.mockClear();
    const template = {
      id: "tpl-1",
      displayName: "Saturday",
      napOwners: [],
      wakeWindowOwners: [],
    };
    renderHook(() => useV3Projection({ day, settings, actuals: [], template }));
    expect(calls).toHaveBeenCalledWith(
      expect.objectContaining({ template, nowMinutes: 8 * 60 + 30 }),
    );
  });

  it("recomputes when actuals change", () => {
    const a1: Event[] = [];
    const a2: Event[] = [
      {
        id: "rec-1",
        dayId: "d-1",
        eventKey: "nap_1",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        endTime: 10 * 60,
        label: "Nap 1",
        hasPutdown: false,
        lifecycle: { state: "completed", committedAt: 10 * 60 },
      },
    ];
    const { result, rerender } = renderHook(
      ({ actuals }) => useV3Projection({ day, settings, actuals }),
      { initialProps: { actuals: a1 } },
    );
    const first = result.current;
    act(() => {
      rerender({ actuals: a2 });
    });
    // Different actuals → different projection identity (not aliased).
    expect(result.current).not.toBe(first);
  });
});
