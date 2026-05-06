import { describe, it, expect } from "vitest";
import type { Day } from "@/domain";
import { renderWithAuth, screen } from "@/test-utils";
import { HistoryList } from "./HistoryList";

const day = (id: string, date: string): Day => ({
  id,
  childId: "child-1",
  date,
  status: "archived",
  wakeTime: "07:00",
  createdAt: `${date}T07:00:00Z`,
  archivedAt: `${date}T22:00:00Z`,
});

describe("HistoryList", () => {
  it("renders a card per archived day", () => {
    renderWithAuth(<HistoryList days={[day("d1", "2026-05-04"), day("d2", "2026-05-03")]} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("renders a calm empty state when no days", () => {
    renderWithAuth(<HistoryList days={[]} />);
    expect(screen.getByText(/no past days yet|nothing here yet/i)).toBeVisible();
  });

  it("orders days newest first", () => {
    renderWithAuth(
      <HistoryList
        days={[
          day("older", "2026-05-01"),
          day("newest", "2026-05-04"),
          day("middle", "2026-05-03"),
        ]}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/history/2026-05-04");
    expect(links[1]).toHaveAttribute("href", "/history/2026-05-03");
    expect(links[2]).toHaveAttribute("href", "/history/2026-05-01");
  });

  it("passes summary to each card when summaries are provided", () => {
    renderWithAuth(
      <HistoryList
        days={[day("d1", "2026-05-04")]}
        summaries={{ d1: { bottles: 5, naps: 4, totalOz: 26 } }}
      />,
    );
    expect(screen.getByRole("link")).toHaveTextContent(/5 bottles.*4 naps.*26 oz/i);
  });
});
