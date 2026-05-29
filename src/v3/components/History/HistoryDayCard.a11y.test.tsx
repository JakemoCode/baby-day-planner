import { describe, it } from "vitest";
import { axe, renderWithAuth } from "@/test-utils";
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

describe("HistoryDayCard a11y", () => {
  it("has no axe violations when rendering with a summary", async () => {
    const { container } = renderWithAuth(
      <HistoryDayCard
        day={day}
        onSelect={() => {}}
        summary={{ bottles: 5, naps: 4, totalOz: 26 }}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
