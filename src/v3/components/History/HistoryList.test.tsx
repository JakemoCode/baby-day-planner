import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import type { Day } from "@/v3/schemas";
import { HistoryList } from "./HistoryList";

const day = (id: string, date: string): Day => ({
  id,
  childId: "child-1",
  date,
  status: "archived",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
});

describe("HistoryList (V3)", () => {
  it("renders an empty state when there are no days", () => {
    renderWithAuth(<HistoryList days={[]} onSelect={() => {}} />);
    expect(screen.getByText(/no past days yet|nothing here yet/i)).toBeVisible();
  });

  it("renders one card per day", () => {
    renderWithAuth(
      <HistoryList days={[day("d1", "2026-05-04"), day("d2", "2026-05-03")]} onSelect={() => {}} />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("orders days newest first", () => {
    renderWithAuth(
      <HistoryList
        days={[
          day("older", "2026-05-01"),
          day("newest", "2026-05-04"),
          day("middle", "2026-05-03"),
        ]}
        onSelect={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent(/May 4/i);
    expect(buttons[1]).toHaveTextContent(/May 3/i);
    expect(buttons[2]).toHaveTextContent(/May 1/i);
  });

  it("forwards card clicks to onSelect with the day id", async () => {
    const onSelect = vi.fn();
    renderWithAuth(<HistoryList days={[day("d1", "2026-05-04")]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("d1");
  });

  it("passes summaries through to each card", () => {
    renderWithAuth(
      <HistoryList
        days={[day("d1", "2026-05-04")]}
        summaries={{ d1: { bottles: 5, naps: 4, totalOz: 26 } }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button")).toHaveTextContent(/5 bottles.*4 naps.*26 oz/i);
  });
});
