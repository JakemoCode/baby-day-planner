import { describe, it } from "vitest";
import { axe, renderWithAuth } from "@/test-utils";
import type { Day, Event, OwnersConfig } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { ArchivedDayView } from "./ArchivedDayView";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const day: Day = {
  id: "day-1",
  childId: "child-1",
  date: "2026-05-04",
  status: "archived",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

const bottle: Event = {
  id: "b1",
  dayId: day.id,
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 7 * 60 + 5,
  label: "Bottle 1",
  amountOz: 5,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "completed", committedAt: 7 * 60 + 5 },
};

describe("ArchivedDayView a11y", () => {
  it("has no axe violations when rendering with events", async () => {
    const { container } = renderWithAuth(
      <ArchivedDayView day={day} events={[bottle]} owners={owners} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
