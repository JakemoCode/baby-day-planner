import { describe, it } from "vitest";
import { expectNoA11yViolations } from "@/test-utils";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog a11y", () => {
  it("has no structural a11y violations when open", async () => {
    await expectNoA11yViolations(
      <ConfirmDialog
        open
        title="Archive today and start fresh?"
        body="Today's data will be moved to History."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
  });
});
