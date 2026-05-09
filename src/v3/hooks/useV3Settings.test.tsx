import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Settings } from "../schemas";
import { useV3Settings } from "./useV3Settings";

const watchSettingsMock = vi.fn();
vi.mock("../repositories/settings", () => ({
  watchSettings: (...args: unknown[]) => watchSettingsMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const sampleSettings = { childId: "child-1", defaultWakeTime: 7 * 60 } as unknown as Settings;

describe("useV3Settings", () => {
  it("returns settings from the V3 repo watcher", async () => {
    let cb: ((s: Settings | null) => void) | undefined;
    watchSettingsMock.mockImplementation((_db, _cid, callback) => {
      cb = callback;
      return () => {};
    });
    const { result } = renderHook(() => useV3Settings("child-1"));
    expect(result.current.loading).toBe(true);
    cb!(sampleSettings);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      // The hook now flows partial docs through withV3SettingsDefaults,
      // so caller-supplied fields stay but missing ones backfill.
      expect(result.current.settings?.defaultWakeTime).toBe(7 * 60);
      expect(result.current.settings?.bottleChain).toBeDefined();
    });
  });
});
