/**
 * useV3Projection — engine output as a React-friendly hook.
 *
 * Tests exercise the REAL engine (not a mock) so the hook's wiring
 * of day / settings / actuals / template into the projectDay context
 * is verified end-to-end. The previous version of this file mocked
 * `projectDay` entirely; the test "recomputes when actuals change"
 * asserted `result.current !== first` which is true for any React
 * re-render regardless of whether the hook propagated the new actuals
 * to the engine. Audit P1-3.
 *
 * `useNowMinutes` stays mocked — wall-clock time would make tests
 * non-deterministic. Every other side of the seam is real.
 */

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PARENT1, PARENT2, aDay, aRecordedNap, aSettings, aTemplate } from "../__tests__/factories";
import type { Event, OwnershipTemplate } from "../schemas";
import { useV3Projection } from "./useV3Projection";

vi.mock("../../hooks/useNowMinutes", () => ({
  useNowMinutes: () => 8 * 60 + 30, // 08:30, deterministic
}));

const day = aDay({ wakeTime: 7 * 60 });
const settings = aSettings({
  wakeWindowsMinutes: [120, 150],
  bottleChain: { bottlesPerDay: 3, bufferAfterWakeMinutes: 10 },
  defaultBottleIntervalMinutes: 180,
});

describe("useV3Projection — null inputs (loading state)", () => {
  it("returns [] when day is null", () => {
    const { result } = renderHook(() => useV3Projection({ day: null, settings, actuals: [] }));
    expect(result.current).toEqual([]);
  });

  it("returns [] when settings is null", () => {
    const { result } = renderHook(() => useV3Projection({ day, settings: null, actuals: [] }));
    expect(result.current).toEqual([]);
  });

  it("returns [] when both day and settings are null", () => {
    const { result } = renderHook(() =>
      useV3Projection({ day: null, settings: null, actuals: [] }),
    );
    expect(result.current).toEqual([]);
  });

  it("produces real output once inputs become non-null", () => {
    const { result, rerender } = renderHook(
      ({ d, s }: { d: typeof day | null; s: typeof settings | null }) =>
        useV3Projection({ day: d, settings: s, actuals: [] }),
      { initialProps: { d: null as typeof day | null, s: null as typeof settings | null } },
    );
    expect(result.current).toEqual([]);

    act(() => {
      rerender({ d: day, s: settings });
    });

    expect(result.current.length).toBeGreaterThan(0);
  });
});

describe("useV3Projection — engine wiring (real projectDay)", () => {
  it("produces the cascade output for the given day + settings (empty actuals)", () => {
    const { result } = renderHook(() => useV3Projection({ day, settings, actuals: [] }));
    const events = result.current;

    // Cascade must emit nap_1 + nap_2 from wakeWindowsMinutes=[120,150].
    // Under the physiology cascade, additional naps are also projected
    // via cadence-extension up to bedtime threshold; we assert the
    // first two as the relevant chain prefix. The hook now runs the
    // render pipeline (renderProjection), which inserts synthetic
    // putdown chips with type="nap" and eventKey=PUTDOWN_KIND_TAG —
    // filter those out to get just the canonical nap_N events.
    const naps = events.filter((e) => e.type === "nap" && e.eventKey !== "__putdown__");
    expect(naps.slice(0, 2).map((n) => n.eventKey)).toEqual(["nap_1", "nap_2"]);

    // First wake window starts at wakeTime, lasts 120 min. nap_1 follows.
    const ww1 = events.find((e) => e.eventKey === "wake_window_1");
    const nap1 = events.find((e) => e.eventKey === "nap_1");
    expect(ww1?.startTime).toBe(7 * 60);
    expect(ww1?.endTime).toBe(7 * 60 + 120);
    expect(nap1?.startTime).toBe(7 * 60 + 120);

    // Bottle cascade emits 3 placeholders. The 3rd one (naive position
    // 13:10) lands inside nap_2's putdown wind-down [12:15, 13:30]
    // (nap_2 = 12:30-13:30, putdownLeadMinutes=15) and R5.6 nudges it
    // to the after-edge 13:30 (closer to the predicted 13:10 than the
    // before-edge 12:15). Bottles 1 and 2 are unaffected.
    const bottles = events.filter((e) => e.type === "bottle");
    expect(bottles).toHaveLength(3);
    expect(bottles.map((b) => b.startTime)).toEqual([
      7 * 60 + 10, // 7:10
      7 * 60 + 10 + 180, // 10:10
      13 * 60 + 30, // 13:30, R5.6-displaced
    ]);
  });

  it("template napOwners actually stamp on projected naps (R12.2)", () => {
    const template: OwnershipTemplate = aTemplate({
      napOwners: [PARENT1, PARENT2],
    });
    const { result } = renderHook(() => useV3Projection({ day, settings, actuals: [], template }));
    const naps = result.current.filter((e) => e.type === "nap");
    expect(naps.find((n) => n.eventKey === "nap_1")?.owner).toEqual(PARENT1);
    expect(naps.find((n) => n.eventKey === "nap_2")?.owner).toEqual(PARENT2);
  });

  it("omitting template means no template-driven owner stamps on naps", () => {
    const { result } = renderHook(() => useV3Projection({ day, settings, actuals: [] }));
    const naps = result.current.filter((e) => e.type === "nap");
    expect(naps.every((n) => n.owner === undefined)).toBe(true);
  });

  it("recompute on actuals change actually re-anchors the cascade (not just reference inequality)", () => {
    // The OLD test asserted `result.current !== first` — true for any
    // React re-render. The right assertion: a recorded nap at a non-
    // default time changes the projected nap_1's geometry AND lifecycle.
    const a1: Event[] = [];
    const recordedNap = aRecordedNap({
      eventKey: "nap_1",
      start: 10 * 60, // 10:00, later than the empty-actuals cascade default 9:00
      end: 11 * 60,
    });
    const a2: Event[] = [recordedNap];

    const { result, rerender } = renderHook(
      ({ actuals }) => useV3Projection({ day, settings, actuals }),
      { initialProps: { actuals: a1 } },
    );

    const napsBefore = result.current.filter((e) => e.type === "nap");
    const nap1Before = napsBefore.find((n) => n.eventKey === "nap_1");
    // Empty actuals: nap_1 is projected at wakeTime + first wake window.
    expect(nap1Before?.startTime).toBe(7 * 60 + 120); // 9:00
    expect(nap1Before?.lifecycle.state).toBe("projected");

    act(() => {
      rerender({ actuals: a2 });
    });

    // Recorded nap_1 is now present at the recorded time, lifecycle=completed.
    const napsAfter = result.current.filter((e) => e.type === "nap");
    const nap1After = napsAfter.find((n) => n.eventKey === "nap_1");
    expect(nap1After?.startTime).toBe(10 * 60);
    expect(nap1After?.lifecycle.state).toBe("completed");
  });

  it("template is threaded into the engine context AND influences output", () => {
    // Old test asserted toHaveBeenCalledWith(...) on a spy — proving
    // the hook passed the template object reference into projectDay
    // but NOT that the template's effect materialized. Real-engine
    // version: assert the templated owner appears on a projected event.
    const template: OwnershipTemplate = aTemplate({ wakeWindowOwners: [PARENT1, PARENT2] });
    const { result } = renderHook(() => useV3Projection({ day, settings, actuals: [], template }));
    const wws = result.current.filter((e) => e.type === "wake_window");
    expect(wws.find((w) => w.eventKey === "wake_window_1")?.owner).toEqual(PARENT1);
    expect(wws.find((w) => w.eventKey === "wake_window_2")?.owner).toEqual(PARENT2);
  });
});
