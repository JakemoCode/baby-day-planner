import { describe, it, expect } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen } from "@/test-utils";
import { NextEventCard } from "./NextEventCard";

const ev = (overrides: Partial<Event>): Event => ({
  id: "e1",
  dayId: "day-1",
  eventKey: "nap_2_putdown",
  type: "putdown",
  label: "Start putting down for Nap 2",
  startTime: "09:30",
  source: "projected",
  status: "projected",
  ...overrides,
});

describe("NextEventCard", () => {
  it("renders the next event label, time and 'in N min' delta", () => {
    renderWithAuth(<NextEventCard event={ev({})} nowMinutes={9 * 60 + 18} />);
    expect(screen.getByText("Start putting down for Nap 2")).toBeVisible();
    expect(screen.getByText("9:30 AM")).toBeVisible();
    expect(screen.getByText(/in 12 min/i)).toBeVisible();
  });

  it("shows 'now' when delta is 0", () => {
    renderWithAuth(<NextEventCard event={ev({ startTime: "09:30" })} nowMinutes={9 * 60 + 30} />);
    expect(screen.getByText(/now/i)).toBeVisible();
  });

  it("formats delta over 60 minutes as '1h 5m'", () => {
    renderWithAuth(<NextEventCard event={ev({ startTime: "10:35" })} nowMinutes={9 * 60 + 30} />);
    expect(screen.getByText(/in 1h 5m/i)).toBeVisible();
  });

  it("displays owner when present", () => {
    renderWithAuth(<NextEventCard event={ev({ owner: "Jake" })} nowMinutes={500} />);
    expect(screen.getByText(/jake/i)).toBeVisible();
  });

  it("renders a calm empty state when event is undefined", () => {
    renderWithAuth(<NextEventCard event={undefined} nowMinutes={500} />);
    expect(screen.getByText(/nothing scheduled/i)).toBeVisible();
  });

  it("appends target time to putdown label when targetEvent is provided", () => {
    const target: Event = {
      id: "n2",
      dayId: "day-1",
      eventKey: "nap_2",
      type: "nap",
      label: "Nap 2",
      startTime: "09:45",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(<NextEventCard event={ev({})} nowMinutes={9 * 60 + 18} targetEvent={target} />);
    expect(screen.getByText("Start putting down for Nap 2 at 9:45 AM")).toBeVisible();
  });

  it("ignores targetEvent for non-putdown events", () => {
    const target: Event = {
      id: "n2",
      dayId: "day-1",
      eventKey: "nap_2",
      type: "nap",
      label: "Nap 2",
      startTime: "09:45",
      source: "projected",
      status: "projected",
    };
    renderWithAuth(
      <NextEventCard
        event={ev({ type: "bottle", label: "Bottle 2", eventKey: "bottle_2" })}
        nowMinutes={9 * 60 + 18}
        targetEvent={target}
      />,
    );
    expect(screen.getByText("Bottle 2")).toBeVisible();
    expect(screen.queryByText(/at 9:45 AM/)).toBeNull();
  });
});
