import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "@/test-utils";
import { PumpVolumeCard } from "./PumpVolumeCard";

describe("PumpVolumeCard a11y", () => {
  it("has no structural a11y violations", async () => {
    const { container } = render(<PumpVolumeCard totalOz={7.25} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
