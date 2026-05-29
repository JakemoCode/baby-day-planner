import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import type { OwnershipTemplate } from "../../schemas";
import { TomorrowForm } from "./TomorrowForm";

const TEMPLATES: OwnershipTemplate[] = [
  {
    id: "tmpl-saturday",
    displayName: "Saturday",
    napOwners: [{ slot: "parent1" }],
    wakeWindowOwners: [{ slot: "parent2" }],
  },
];

describe("TomorrowForm a11y", () => {
  it("has no axe violations with wake time input and template picker visible", async () => {
    const { container } = render(
      <TomorrowForm
        value={{ wakeTime: 7 * 60 }}
        templates={TEMPLATES}
        onChange={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
