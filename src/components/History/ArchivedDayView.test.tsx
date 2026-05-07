import { describe, it, expect, vi } from "vitest";
import type { Day, Event } from "@/domain";
import { renderWithAuth, screen, userEvent } from "@/test-utils";
import { ArchivedDayView } from "./ArchivedDayView";

const day: Day = {
  id: "day-1",
  childId: "child-1",
  date: "2026-05-04",
  status: "archived",
  wakeTime: "07:00",
  createdAt: "2026-05-04T07:00:00Z",
  archivedAt: "2026-05-04T22:00:00Z",
};

const bottle: Event = {
  id: "b1",
  dayId: day.id,
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  label: "Bottle 1",
  startTime: "07:05",
  amountOz: 5,
  source: "actual",
  status: "actual",
};

describe("ArchivedDayView", () => {
  it("renders the formatted date as a heading", () => {
    renderWithAuth(<ArchivedDayView day={day} events={[bottle]} />);
    expect(screen.getByRole("heading")).toHaveTextContent(/Mon, May 4|May 4/i);
  });

  it("renders an empty state when there are no events", () => {
    renderWithAuth(<ArchivedDayView day={day} events={[]} />);
    expect(screen.getByText(/no events|nothing recorded/i)).toBeVisible();
  });

  it("does not make events tappable when onEditEvent is omitted", () => {
    renderWithAuth(<ArchivedDayView day={day} events={[bottle]} />);
    expect(screen.queryByRole("button", { name: /Bottle 1/ })).toBeNull();
  });

  it("makes events tappable and forwards taps when onEditEvent is provided", async () => {
    const onEditEvent = vi.fn();
    renderWithAuth(<ArchivedDayView day={day} events={[bottle]} onEditEvent={onEditEvent} />);
    await userEvent.click(screen.getByRole("button", { name: /Bottle 1/ }));
    expect(onEditEvent).toHaveBeenCalledTimes(1);
    expect(onEditEvent.mock.calls[0]?.[0]).toMatchObject({ id: "b1" });
  });
});
