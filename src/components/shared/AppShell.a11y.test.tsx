import { describe, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
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

describe("AppShell a11y", () => {
  it("has no structural a11y violations", async () => {
    await expectNoA11yViolations(
      <AppShell childId="kid-test" childName="Aden">
        <p>page content</p>
      </AppShell>,
    );
  });
});
