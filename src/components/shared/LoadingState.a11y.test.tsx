import { describe, it } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { LoadingState } from "./LoadingState";

describe("LoadingState a11y", () => {
  it("has no structural a11y violations", async () => {
    await expectNoA11yViolations(<LoadingState />);
  });
});
