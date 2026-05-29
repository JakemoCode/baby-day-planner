import { describe, it } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { NO_OWNER, type OwnersConfig } from "../../schemas";
import { OwnerPickerV3 } from "./OwnerPickerV3";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Sam" },
  other: [{ id: "daycare", displayName: "Daycare" }],
};

describe("OwnerPickerV3 a11y", () => {
  it("has no structural a11y violations", async () => {
    await expectNoA11yViolations(
      <OwnerPickerV3 owners={owners} value={NO_OWNER} onChange={() => {}} />,
      { child: null },
    );
  });
});
