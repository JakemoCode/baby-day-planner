/**
 * §F55 — list-sheet for collapsed-cluster tap target.
 * Covers rendering, tap routing, and dismiss.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, OwnersConfig } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { GroupedEventsSheet } from "./GroupedEventsSheet";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const ev = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "x",
  type: "bottle",
  kind: "instant",
  startTime: 0,
  label: "x",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("GroupedEventsSheet", () => {
  it("renders null when closed", () => {
    const { container } = render(
      <GroupedEventsSheet
        open={false}
        items={[ev({ id: "a" })]}
        startMinutes={9 * 60}
        endMinutes={9 * 60}
        owners={owners}
        onCancel={() => {}}
        onTapEvent={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("titles the sheet with the time range when start and end differ", () => {
    render(
      <GroupedEventsSheet
        open
        items={[
          ev({ id: "a", label: "Vitamin", startTime: 9 * 60 + 30 }),
          ev({ id: "b", label: "Diaper", startTime: 9 * 60 + 35 }),
        ]}
        startMinutes={9 * 60 + 30}
        endMinutes={9 * 60 + 35}
        owners={owners}
        onCancel={() => {}}
        onTapEvent={() => {}}
      />,
    );
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent(/9:30a.*9:35a/);
  });

  it("renders one tappable row per event with label and time", () => {
    render(
      <GroupedEventsSheet
        open
        items={[
          ev({ id: "a", label: "Vitamin", startTime: 9 * 60 + 30 }),
          ev({ id: "b", label: "Diaper", startTime: 9 * 60 + 35 }),
        ]}
        startMinutes={9 * 60 + 30}
        endMinutes={9 * 60 + 35}
        owners={owners}
        onCancel={() => {}}
        onTapEvent={() => {}}
      />,
    );
    expect(screen.getByText("Vitamin")).toBeVisible();
    expect(screen.getByText("Diaper")).toBeVisible();
  });

  it("invokes onTapEvent with the row's event when clicked", async () => {
    const onTapEvent = vi.fn();
    const vitamin = ev({ id: "a", label: "Vitamin", startTime: 9 * 60 + 30 });
    const diaper = ev({ id: "b", label: "Diaper", startTime: 9 * 60 + 35 });
    render(
      <GroupedEventsSheet
        open
        items={[vitamin, diaper]}
        startMinutes={9 * 60 + 30}
        endMinutes={9 * 60 + 35}
        owners={owners}
        onCancel={() => {}}
        onTapEvent={onTapEvent}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Diaper/ }));
    expect(onTapEvent).toHaveBeenCalledWith(diaper);
  });

  it("invokes onCancel when the user clicks the sheet's Cancel button", async () => {
    const onCancel = vi.fn();
    render(
      <GroupedEventsSheet
        open
        items={[ev({ id: "a", label: "Vitamin" })]}
        startMinutes={9 * 60}
        endMinutes={9 * 60}
        owners={owners}
        onCancel={onCancel}
        onTapEvent={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
