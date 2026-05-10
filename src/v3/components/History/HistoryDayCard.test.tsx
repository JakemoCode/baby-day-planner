import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import type { Day } from "@/v3/schemas";
import { HistoryDayCard } from "./HistoryDayCard";

const day: Day = {
  id: "day-1",
  childId: "child-1",
  date: "2026-05-04",
  status: "archived",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

describe("HistoryDayCard (V3)", () => {
  it("shows the date in human-readable format", () => {
    renderWithAuth(<HistoryDayCard day={day} onSelect={() => {}} />);
    expect(screen.getByRole("button")).toHaveAccessibleName(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/i);
  });

  it("invokes onSelect with the day id when clicked", async () => {
    const onSelect = vi.fn();
    renderWithAuth(<HistoryDayCard day={day} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("day-1");
  });

  it("renders an optional summary line", () => {
    renderWithAuth(
      <HistoryDayCard
        day={day}
        onSelect={() => {}}
        summary={{ bottles: 5, naps: 4, totalOz: 26 }}
      />,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent(/5 bottles/i);
    expect(button).toHaveTextContent(/4 naps/i);
    expect(button).toHaveTextContent(/26 oz/i);
  });

  it("singularises counts of 1", () => {
    renderWithAuth(
      <HistoryDayCard
        day={day}
        onSelect={() => {}}
        summary={{ bottles: 1, naps: 1, totalOz: 5 }}
      />,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent(/1 bottle\b/i);
    expect(button).toHaveTextContent(/1 nap\b/i);
  });

  it("omits the summary line when no summary is provided", () => {
    renderWithAuth(<HistoryDayCard day={day} onSelect={() => {}} />);
    expect(screen.getByRole("button")).not.toHaveTextContent(/bottles?/i);
  });
});
