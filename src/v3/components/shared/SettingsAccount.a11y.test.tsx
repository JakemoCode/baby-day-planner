import { describe, it } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { SettingsAccount } from "./SettingsAccount";

describe("SettingsAccount a11y", () => {
  it("has no structural a11y violations", async () => {
    await expectNoA11yViolations(<SettingsAccount />);
  });
});
