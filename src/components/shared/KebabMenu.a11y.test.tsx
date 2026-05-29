import { describe, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { KebabMenu } from "./KebabMenu";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("KebabMenu a11y", () => {
  it("has no structural a11y violations (closed state)", async () => {
    await expectNoA11yViolations(<KebabMenu />);
  });
});
