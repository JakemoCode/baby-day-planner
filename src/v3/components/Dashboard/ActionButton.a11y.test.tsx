import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import { ActionButton } from "./ActionButton";

describe("ActionButton a11y", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <ActionButton variant="primary" onClick={() => {}}>
        Start Day
      </ActionButton>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
