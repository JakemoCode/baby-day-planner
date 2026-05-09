import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Day } from "../schemas";
import { useV3Day } from "./useV3Day";

const watchActiveDayMock = vi.fn();
vi.mock("../repositories/days", () => ({
  watchActiveDay: (...args: unknown[]) => watchActiveDayMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const sampleDay: Day = {
  id: "d-1",
  childId: "child-1",
  date: "2026-05-09",
  status: "active",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

describe("useV3Day", () => {
  it("returns the active day from the V3 repo watcher", async () => {
    let cb: ((d: Day | null) => void) | undefined;
    watchActiveDayMock.mockImplementation((_db, _cid, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Day("child-1"));
    expect(result.current.loading).toBe(true);
    cb!(sampleDay);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.day).toEqual(sampleDay);
    });
  });
});
