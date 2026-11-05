import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import { SkippedNaps } from "./SkippedNaps";

describe("SkippedNaps a11y", () => {
  it("has no structural a11y violations", async () => {
    const { container } = render(<SkippedNaps napKeys={["nap_2", "nap_3"]} onRestore={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
