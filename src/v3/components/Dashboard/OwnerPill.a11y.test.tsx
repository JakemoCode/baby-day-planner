import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { OwnersConfig } from "@/v3/schemas";
import { axe } from "@/test-utils";
import { OwnerPill } from "./OwnerPill";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Kelly" },
  other: [{ id: "daycare", displayName: "Daycare" }],
};

describe("OwnerPill a11y", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <OwnerPill owner={{ slot: "parent1" }} owners={owners} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
