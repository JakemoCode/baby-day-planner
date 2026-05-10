import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewCard } from "./PreviewCard";

describe("PreviewCard", () => {
  it("renders heading + primary + subtitle + meta", () => {
    render(
      <PreviewCard
        heading="Next bottle"
        primary="9:30 AM"
        subtitle="logged · 4 oz Bottle 2"
        meta="Last: 7:00 AM · 4 oz"
      />,
    );
    expect(screen.getByLabelText("Next bottle")).toBeVisible();
    expect(screen.getByText("Next bottle")).toBeVisible();
    expect(screen.getByText("9:30 AM")).toBeVisible();
    expect(screen.getByText(/logged · 4 oz Bottle 2/)).toBeVisible();
    expect(screen.getByText(/Last: 7:00 AM · 4 oz/)).toBeVisible();
  });

  it("uses ariaLabel override when provided", () => {
    render(<PreviewCard heading="Next nap" primary="9:45 AM" ariaLabel="Custom label" />);
    expect(screen.getByLabelText("Custom label")).toBeVisible();
    expect(screen.queryByLabelText("Next nap")).toBeNull();
  });

  it("renders empty state when primary is null", () => {
    render(<PreviewCard heading="Next nap" primary={null} emptyMessage="No more naps today" />);
    expect(screen.getByText("No more naps today")).toBeVisible();
  });

  it("hides subtitle in empty state even when provided", () => {
    render(
      <PreviewCard
        heading="Next nap"
        primary={null}
        emptyMessage="No more naps today"
        subtitle="should-not-appear"
      />,
    );
    expect(screen.queryByText("should-not-appear")).toBeNull();
  });

  it("still shows meta in empty state", () => {
    render(
      <PreviewCard
        heading="Next bottle"
        primary={null}
        emptyMessage="No more bottles today"
        meta="Last: 4:00 PM"
      />,
    );
    expect(screen.getByText("Last: 4:00 PM")).toBeVisible();
  });

  it("omits meta paragraph entirely when meta is undefined", () => {
    const { container } = render(<PreviewCard heading="Next nap" primary="9:45 AM" />);
    // Only heading + primary paragraphs rendered.
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });
});
