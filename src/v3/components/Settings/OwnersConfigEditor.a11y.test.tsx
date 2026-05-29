import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import type { OwnersConfig } from "../../schemas";
import { OwnersConfigEditor } from "./OwnersConfigEditor";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Sam" },
  other: [{ id: "daycare", displayName: "Daycare" }],
};

describe("OwnersConfigEditor a11y", () => {
  it("has no axe violations with parent and other owner inputs visible", async () => {
    const { container } = render(<OwnersConfigEditor value={owners} onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
