import { describe, it, expect } from "vitest";
import { renderWithAuth, screen } from "@/test-utils";
import { HistoryDayCard } from "./HistoryDayCard";

describe("HistoryDayCard", () => {
  it("renders the formatted date as the card heading", () => {
    renderWithAuth(<HistoryDayCard date="2026-05-04" />);
    expect(screen.getByRole("link")).toHaveAccessibleName(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/i);
  });

  it("links to /history/[date]", () => {
    renderWithAuth(<HistoryDayCard date="2026-05-04" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/history/2026-05-04");
  });

  it("renders an optional summary line", () => {
    renderWithAuth(
      <HistoryDayCard date="2026-05-04" summary={{ bottles: 5, naps: 4, totalOz: 26 }} />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(/5 bottles/i);
    expect(link).toHaveTextContent(/4 naps/i);
    expect(link).toHaveTextContent(/26 oz/i);
  });

  it("singularises counts of 1", () => {
    renderWithAuth(
      <HistoryDayCard date="2026-05-04" summary={{ bottles: 1, naps: 1, totalOz: 5 }} />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(/1 bottle\b/i);
    expect(link).toHaveTextContent(/1 nap\b/i);
  });

  it("omits the summary line when no summary is provided", () => {
    renderWithAuth(<HistoryDayCard date="2026-05-04" />);
    const link = screen.getByRole("link");
    expect(link).not.toHaveTextContent(/bottles?/i);
  });
});
