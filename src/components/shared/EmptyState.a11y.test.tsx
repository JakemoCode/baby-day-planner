import { describe, it } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { EmptyState } from "./EmptyState";

// Proof test for the axe a11y harness (see test-utils `axe`/`expectNoA11yViolations`).
describe("EmptyState a11y", () => {
  it("has no structural a11y violations", async () => {
    await expectNoA11yViolations(<EmptyState title="No bottles yet" body="Tap + to log one" />);
  });
});
