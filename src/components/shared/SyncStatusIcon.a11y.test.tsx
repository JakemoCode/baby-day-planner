import { describe, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { SyncStatusIcon } from "./SyncStatusIcon";

vi.mock("@/hooks/useSyncStatus", () => ({
  useSyncStatus: () => ({ online: true, lastSyncedAt: Date.now() - 30_000 }),
}));

describe("SyncStatusIcon a11y", () => {
  it("has no structural a11y violations (online/synced state)", async () => {
    await expectNoA11yViolations(<SyncStatusIcon />);
  });
});
