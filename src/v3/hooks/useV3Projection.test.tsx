/**
 * Tests use the REAL engine to verify hook wiring end-to-end (audit P1-3).
 * `useNowMinutes` is mocked for determinism; everything else is real.
 */

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PARENT1, PARENT2, aDay, aRecordedNap, aSettings, aTemplate } from "../__tests__/factories";
import type { Event, OwnershipTemplate } from "../schemas";
import { useV3Projection } from "./useV3Projection";
import { PUTDOWN_KIND_TAG } from "../components/Timeline/expandPutdown";

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

    // Assert first two naps (chain prefix); filter PUTDOWN_KIND_TAG synthetic chips.
    const naps = events.filter((e) => e.type === "nap" && e.eventKey !== PUTDOWN_KIND_TAG);
    expect(naps.slice(0, 2).map((n) => n.eventKey)).toEqual(["nap_1", "nap_2"]);

    const ww1 = events.find((e) => e.eventKey === "wake_window_1");
    const nap1 = events.find((e) => e.eventKey === "nap_1");
    expect(ww1?.startTime).toBe(7 * 60);
    expect(ww1?.endTime).toBe(7 * 60 + 120);
    expect(nap1?.startTime).toBe(7 * 60 + 120);

    // Bottle 3 naive position 13:10 falls inside nap_2's putdown window;
    // R5.6 nudges it to the after-edge 13:30.
    // §F66: the chain fills the whole day; assert the documented prefix incl the
    // R5.6-displaced 3rd bottle.
    const bottles = events.filter((e) => e.type === "bottle");
    expect(bottles.slice(0, 3).map((b) => b.startTime)).toEqual([
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
    expect(naps.every((n) => n.owner.slot === "none")).toBe(true);
  });

  it("recompute on actuals change actually re-anchors the cascade (not just reference inequality)", () => {
    // Asserts geometry + lifecycle change, not mere reference inequality (audit P1-3).
    const a1: Event[] = [];
    const recordedNap = aRecordedNap({
      eventKey: "nap_1",
      start: 10 * 60, // later than empty-actuals cascade default 9:00
      end: 11 * 60,
    });
    const a2: Event[] = [recordedNap];

    const { result, rerender } = renderHook(
      ({ actuals }) => useV3Projection({ day, settings, actuals }),
      { initialProps: { actuals: a1 } },
    );

    const napsBefore = result.current.filter((e) => e.type === "nap");
    const nap1Before = napsBefore.find((n) => n.eventKey === "nap_1");
    // Empty actuals: projected at wakeTime + first wake window.
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
    // Asserts owner materializes on output, not just that the reference was passed (audit P1-3).
    const template: OwnershipTemplate = aTemplate({ wakeWindowOwners: [PARENT1, PARENT2] });
    const { result } = renderHook(() => useV3Projection({ day, settings, actuals: [], template }));
    const wws = result.current.filter((e) => e.type === "wake_window");
    expect(wws.find((w) => w.eventKey === "wake_window_1")?.owner).toEqual(PARENT1);
    expect(wws.find((w) => w.eventKey === "wake_window_2")?.owner).toEqual(PARENT2);
  });
});
