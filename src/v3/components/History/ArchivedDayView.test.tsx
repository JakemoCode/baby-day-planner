import { describe, it, expect, vi } from "vitest";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import type { Day, Event, OwnersConfig } from "@/v3/schemas";
import { ArchivedDayView } from "./ArchivedDayView";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [{ id: "daycare", displayName: "Daycare", color: "#ccc" }],
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
  lifecycle: { state: "completed", committedAt: 7 * 60 + 5 },
};

const nap: Event = {
  id: "n1",
  dayId: day.id,
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  lifecycle: { state: "completed", committedAt: 10 * 60 },
};

describe("ArchivedDayView (V3)", () => {
  it("renders the formatted date as a heading", () => {
    renderWithAuth(
      <ArchivedDayView day={day} events={[bottle]} owners={owners} putdownLeadMinutes={15} />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent(/Mon, May 4|May 4/i);
  });

  it("renders an empty state when there are no events", () => {
    renderWithAuth(
      <ArchivedDayView day={day} events={[]} owners={owners} putdownLeadMinutes={15} />,
    );
    expect(screen.getByText(/no events|nothing recorded/i)).toBeVisible();
  });

  it("renders TimelineV3 with the passed events", () => {
    renderWithAuth(
      <ArchivedDayView day={day} events={[bottle, nap]} owners={owners} putdownLeadMinutes={15} />,
    );
    // Block + instant chip both come from TimelineV3.
    expect(screen.getAllByTestId("timeline-block").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("instant-chip")).toBeInTheDocument();
  });

  it("passes the owners config through to TimelineV3 (resolves owner display names)", () => {
    const owned: Event = {
      ...bottle,
      owner: { slot: "parent1" },
    };
    renderWithAuth(
      <ArchivedDayView day={day} events={[owned]} owners={owners} putdownLeadMinutes={15} />,
    );
    // parent1.displayName === "Jake" — owner lookup goes through OwnersConfig.
    expect(screen.getByText(/Jake/)).toBeInTheDocument();
  });

  it("does not make events tappable when onEditEvent is omitted", () => {
    renderWithAuth(
      <ArchivedDayView day={day} events={[bottle]} owners={owners} putdownLeadMinutes={15} />,
    );
    expect(screen.queryByRole("button", { name: /Bottle 1/ })).toBeNull();
  });

  it("forwards taps to onEditEvent when provided", async () => {
    const onEditEvent = vi.fn();
    renderWithAuth(
      <ArchivedDayView
        day={day}
        events={[bottle]}
        owners={owners}
        putdownLeadMinutes={15}
        onEditEvent={onEditEvent}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Bottle 1/ }));
    expect(onEditEvent).toHaveBeenCalledTimes(1);
    expect(onEditEvent.mock.calls[0]?.[0]).toMatchObject({ id: "b1" });
  });
});
