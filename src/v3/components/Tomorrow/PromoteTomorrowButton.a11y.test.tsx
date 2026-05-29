import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import { PromoteTomorrowButton } from "./PromoteTomorrowButton";

describe("PromoteTomorrowButton a11y", () => {
  it("has no axe violations", async () => {
    const { container } = render(<PromoteTomorrowButton onPromote={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
