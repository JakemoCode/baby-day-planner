import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Day } from "@/domain";
import { useDay } from "./useDay";

const watchActiveDayMock = vi.fn();
vi.mock("@/repositories/days", () => ({
  watchActiveDay: (...args: unknown[]) => watchActiveDayMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const sampleDay: Day = {
  id: "d-1",
  childId: "child-1",
  date: "2026-05-05",
  status: "active",
  wakeTime: "07:00",
  createdAt: "2026-05-05T07:00:00Z",
};

describe("useDay", () => {
  it("returns the active day from the watcher", async () => {
    let cb: ((d: Day | null) => void) | undefined;
    watchActiveDayMock.mockImplementation((_db, _cid, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useDay("child-1"));
    expect(result.current.loading).toBe(true);
    cb!(sampleDay);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.day).toEqual(sampleDay);
    });
  });
});
