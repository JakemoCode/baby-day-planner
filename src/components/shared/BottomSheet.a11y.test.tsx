import { describe, it } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { BottomSheet } from "./BottomSheet";

describe("BottomSheet a11y", () => {
  it("has no structural a11y violations when open", async () => {
    await expectNoA11yViolations(
      <BottomSheet open title="Adjust bottle" onCancel={() => {}}>
        <p>Sheet content</p>
      </BottomSheet>,
    );
  });
});
