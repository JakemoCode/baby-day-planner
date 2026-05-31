import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PumpVolumeCard } from "./PumpVolumeCard";

describe("PumpVolumeCard", () => {
  it("shows the titled total in ounces", () => {
    render(<PumpVolumeCard totalOz={7.25} />);
    expect(screen.getByText("Total pump volume today")).toBeVisible();
    expect(screen.getByText("7.25 oz")).toBeVisible();
  });

  it("trims trailing zeros (whole and half values)", () => {
    const { rerender } = render(<PumpVolumeCard totalOz={7} />);
    expect(screen.getByText("7 oz")).toBeVisible();
    rerender(<PumpVolumeCard totalOz={7.5} />);
    expect(screen.getByText("7.5 oz")).toBeVisible();
  });

  it("renders 0 oz when nothing is recorded yet", () => {
    render(<PumpVolumeCard totalOz={0} />);
    expect(screen.getByText("0 oz")).toBeVisible();
  });
});
