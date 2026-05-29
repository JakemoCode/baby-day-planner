import { describe, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { BottomTabs } from "./BottomTabs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/v3/hooks/useV3TomorrowDraftCount", () => ({
  useV3TomorrowDraftCount: () => 0,
}));

describe("BottomTabs a11y", () => {
  it("has no structural a11y violations", async () => {
    await expectNoA11yViolations(<BottomTabs />);
  });
});
