import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const currentLocalDate = vi.fn(() => "2026-05-31");
vi.mock("../ui/time", () => ({ currentLocalDate: () => currentLocalDate() }));

import { useCurrentLocalDate } from "./useCurrentLocalDate";

describe("useCurrentLocalDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    currentLocalDate.mockReturnValue("2026-05-31");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the current local date on mount", () => {
    const { result } = renderHook(() => useCurrentLocalDate());
    expect(result.current).toBe("2026-05-31");
  });

  it("advances to the new date when the clock crosses midnight (interval tick)", () => {
    const { result } = renderHook(() => useCurrentLocalDate());
    currentLocalDate.mockReturnValue("2026-06-01");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe("2026-06-01");
  });

  it("re-derives the date immediately when the tab becomes visible", () => {
    const { result } = renderHook(() => useCurrentLocalDate());
    currentLocalDate.mockReturnValue("2026-06-01");
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("2026-06-01");
  });

  it("re-derives the date on window focus", () => {
    const { result } = renderHook(() => useCurrentLocalDate());
    currentLocalDate.mockReturnValue("2026-06-01");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(result.current).toBe("2026-06-01");
  });
});
