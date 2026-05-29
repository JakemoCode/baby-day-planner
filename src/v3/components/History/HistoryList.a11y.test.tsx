import { describe, it } from "vitest";
import { axe, renderWithAuth } from "@/test-utils";
import type { Day } from "@/v3/schemas";
import { HistoryList } from "./HistoryList";

const days: Day[] = [
  {
    id: "d1",
    childId: "child-1",
    date: "2026-05-04",
    status: "archived",
    wakeTime: 7 * 60,
    suppressedRecurringIds: [],
    suppressedDaycareDay: false,
  },
  {
    id: "d2",
    childId: "child-1",
    date: "2026-05-03",
    status: "archived",
    wakeTime: 7 * 60,
    suppressedRecurringIds: [],
    suppressedDaycareDay: false,
  },
];

describe("HistoryList a11y", () => {
  it("has no axe violations when rendering a list of days", async () => {
    const { container } = renderWithAuth(<HistoryList days={days} onSelect={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
