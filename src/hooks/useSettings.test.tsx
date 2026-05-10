import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSettings } from "./useSettings";
import { sampleSettings } from "@/domain/__fixtures__/sample";

const watchSettingsMock = vi.fn();
vi.mock("@/repositories/settings", () => ({
  watchSettings: (...args: unknown[]) => watchSettingsMock(...args),
}));

vi.mock("@/lib/firebase/client", () => ({
  db: {},
}));

describe("useSettings", () => {
  it("returns loading=true initially, then settings once watcher fires", async () => {
    let cb: ((s: typeof sampleSettings | null) => void) | undefined;
    watchSettingsMock.mockImplementation((_db, _childId, callback) => {
      cb = callback;
      return () => {};
    });

    const { result } = renderHook(() => useSettings("child-1"));
    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toBeNull();

    cb!(sampleSettings);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      // Settings now flow through withV2SettingsBackcompat. For a V2-shape
      // input the result preserves the V2 shape (back-compat is only
      // active when V3-shape fields show up).
      expect(result.current.settings?.bedtimeThreshold).toBe(sampleSettings.bedtimeThreshold);
    });
  });

  it("unsubscribes on unmount", () => {
    const unsub = vi.fn();
    watchSettingsMock.mockImplementation(() => unsub);
    const { unmount } = renderHook(() => useSettings("child-1"));
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
