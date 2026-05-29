import { describe, it } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { Header } from "./Header";

describe("Header a11y", () => {
  it("has no structural a11y violations", async () => {
    await expectNoA11yViolations(<Header childName="Aden" date="2026-05-05" />);
  });
});
