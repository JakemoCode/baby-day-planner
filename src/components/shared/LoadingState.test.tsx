import { describe, it, expect } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import { LoadingState } from "./LoadingState";

describe("LoadingState", () => {
  it("has accessible status role", () => {
    renderWithAuth(<LoadingState />);
    expect(screen.getByRole("status")).toBeVisible();
  });

  it("provides an accessible label", () => {
    renderWithAuth(<LoadingState />);
    expect(screen.getByRole("status")).toHaveAccessibleName(/loading/i);
  });

  it("uses a custom label when provided", () => {
    renderWithAuth(<LoadingState label="Loading today's events" />);
    expect(screen.getByRole("status")).toHaveAccessibleName(/loading today's events/i);
  });
});
