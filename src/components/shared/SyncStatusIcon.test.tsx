import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { SyncStatusIcon } from "./SyncStatusIcon";

const useSyncStatusMock = vi.fn();
vi.mock("@/hooks/useSyncStatus", () => ({
  useSyncStatus: () => useSyncStatusMock(),
}));

describe("SyncStatusIcon", () => {
  it("renders with online state and a relative-time label when synced", () => {
    useSyncStatusMock.mockReturnValue({ online: true, lastSyncedAt: Date.now() - 30_000 });
    renderWithAuth(<SyncStatusIcon />);
    const button = screen.getByRole("button", { name: /sync/i });
    expect(button).toBeVisible();
    expect(button).toHaveAccessibleName(/synced/i);
  });

  it("indicates offline state in its label", () => {
    useSyncStatusMock.mockReturnValue({ online: false, lastSyncedAt: null });
    renderWithAuth(<SyncStatusIcon />);
    expect(screen.getByRole("button", { name: /offline/i })).toBeVisible();
  });

  it("indicates 'never synced' when online but no sync has happened yet", () => {
    useSyncStatusMock.mockReturnValue({ online: true, lastSyncedAt: null });
    renderWithAuth(<SyncStatusIcon />);
    expect(screen.getByRole("button", { name: /connecting|syncing/i })).toBeVisible();
  });

  it("invokes onRefresh when tapped", async () => {
    useSyncStatusMock.mockReturnValue({ online: true, lastSyncedAt: Date.now() });
    const onRefresh = vi.fn();
    renderWithAuth(<SyncStatusIcon onRefresh={onRefresh} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
