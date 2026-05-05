import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSyncStatus } from "./useSyncStatus";

const onSnapshotsInSyncMock = vi.fn();
vi.mock("firebase/firestore", () => ({
  onSnapshotsInSync: (...args: unknown[]) => onSnapshotsInSyncMock(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));

describe("useSyncStatus", () => {
  it("starts online based on navigator and updates lastSyncedAt on each in-sync event", () => {
    let triggerInSync: (() => void) | undefined;
    onSnapshotsInSyncMock.mockImplementation((_db, cb) => {
      triggerInSync = cb;
      return () => {};
    });

    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.online).toBe(navigator.onLine);
    expect(result.current.lastSyncedAt).toBeNull();

    act(() => {
      triggerInSync!();
    });
    expect(result.current.lastSyncedAt).not.toBeNull();
  });

  it("reflects offline event", () => {
    onSnapshotsInSyncMock.mockImplementation(() => () => {});
    const { result } = renderHook(() => useSyncStatus());
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.online).toBe(false);
  });
});
