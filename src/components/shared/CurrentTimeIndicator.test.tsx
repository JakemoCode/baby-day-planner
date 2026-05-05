import { describe, it, expect } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import { CurrentTimeIndicator } from "./CurrentTimeIndicator";

describe("CurrentTimeIndicator", () => {
  it("renders at the given pixel position", () => {
    renderWithAuth(<CurrentTimeIndicator topPx={240} timeLabel="9:30 AM" />);
    const indicator = screen.getByRole("presentation");
    expect(indicator).toHaveStyle({ top: "240px" });
  });

  it("renders the time label", () => {
    renderWithAuth(<CurrentTimeIndicator topPx={120} timeLabel="7:05 AM" />);
    expect(screen.getByText("7:05 AM")).toBeInTheDocument();
  });

  it("includes accessible name", () => {
    renderWithAuth(<CurrentTimeIndicator topPx={0} timeLabel="12:00 AM" />);
    expect(screen.getByLabelText(/current time/i)).toBeInTheDocument();
  });
});
