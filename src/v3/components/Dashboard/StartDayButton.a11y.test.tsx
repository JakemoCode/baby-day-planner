import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import { StartDayButton } from "./StartDayButton";

describe("StartDayButton a11y", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <StartDayButton hasTomorrowPlan={false} onStart={async () => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
