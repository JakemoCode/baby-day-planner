import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import { PreviewCard } from "./PreviewCard";

describe("PreviewCard a11y", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <PreviewCard
        heading="Next bottle"
        primary="9:30 AM"
        subtitle="logged · 4 oz Bottle 2"
        meta="Last: 7:00 AM · 4 oz"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
