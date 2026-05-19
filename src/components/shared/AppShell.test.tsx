import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import { useV3Day } from "@/v3/hooks/useV3Day";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/v3/hooks/useV3Day", () => ({
  useV3Day: vi.fn(() => ({ day: { date: "2026-05-05" }, loading: false })),
}));

vi.mock("@/hooks/useSyncStatus", () => ({
  useSyncStatus: () => ({ online: true, lastSyncedAt: Date.now() }),
}));

describe("AppShell", () => {
  it("renders header with child name and date", () => {
    renderWithAuth(
      <AppShell childId="kid-test" childName="Aden">
        <p>page content</p>
      </AppShell>,
    );
    expect(screen.getByText(/Aden/i)).toBeVisible();
  });

  it("renders bottom tabs nav", () => {
    renderWithAuth(
      <AppShell childId="kid-test" childName="Aden">
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeVisible();
  });

  it("renders the children inside main", () => {
    renderWithAuth(
      <AppShell childId="kid-test" childName="Aden">
        <p>page content</p>
      </AppShell>,
    );
    const main = screen.getByRole("main");
    expect(main).toContainElement(screen.getByText("page content"));
  });

  it("renders SyncStatusIcon and KebabMenu in header actions", () => {
    renderWithAuth(
      <AppShell childId="kid-test" childName="Aden">
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByRole("button", { name: /sync|synced/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /more options/i })).toBeVisible();
  });

  it("renders without throwing when there's no active day (Header omits date)", () => {
    vi.mocked(useV3Day).mockReturnValueOnce({ day: null, loading: false });
    renderWithAuth(
      <AppShell childId="kid-test" childName="Aden">
        <p>page content</p>
      </AppShell>,
    );
    // Shell still renders core landmarks even with no day.
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeVisible();
    // The 2026-05-05 date (from the default mock) must NOT appear.
    expect(screen.queryByText(/2026-05-05/)).not.toBeInTheDocument();
  });
});
