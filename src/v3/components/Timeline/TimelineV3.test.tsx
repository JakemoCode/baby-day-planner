/**
 * Behavioural tests for TimelineV3. Coverage focuses on the V3 contract:
 * V3 event shapes render, putdown synthesis works end-to-end, owner refs
 * resolve to display strings + slot data attributes.
 *
 * Geometry / styling parity with V2 is covered by the existing V2 tests
 * (the CSS modules are shared).
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, OwnersConfig } from "../../schemas";
import { TimelineV3 } from "./TimelineV3";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [{ id: "daycare", displayName: "Daycare", color: "#ccc" }],
};

const ev = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "x",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("TimelineV3", () => {
  it("renders the empty state when no events", () => {
    render(<TimelineV3 events={[]} owners={owners} putdownLeadMinutes={15} />);
    expect(screen.getByText("Nothing scheduled yet.")).toBeInTheDocument();
  });

  it("renders block events and instant chips", () => {
    const events: Event[] = [
      ev({ id: "nap1" }),
      ev({
        id: "bot1",
        type: "bottle",
        kind: "instant",
        startTime: 7 * 60 + 30,
        label: "Bottle 1",
      }),
    ];
    render(<TimelineV3 events={events} owners={owners} putdownLeadMinutes={15} />);
    expect(screen.getAllByTestId("timeline-block").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("instant-chip")).toBeInTheDocument();
  });

  it("synthesizes a putdown block before parent events with hasPutdown:true", () => {
    const events: Event[] = [ev({ id: "nap1", hasPutdown: true })];
    render(<TimelineV3 events={events} owners={owners} putdownLeadMinutes={15} />);
    const blocks = screen.getAllByTestId("timeline-block");
    // 2 blocks: the synthetic putdown + the nap itself.
    expect(blocks).toHaveLength(2);
    expect(blocks.some((b) => b.getAttribute("data-type") === "putdown")).toBe(true);
  });

  it("encodes the owner slot via data-owner attributes", () => {
    const events: Event[] = [
      ev({ id: "nap1", owner: { slot: "parent1" } }),
      ev({
        id: "bot1",
        type: "bottle",
        kind: "instant",
        startTime: 7 * 60 + 30,
        label: "Bottle 1",
        owner: { slot: "other", otherId: "daycare" },
      }),
    ];
    render(<TimelineV3 events={events} owners={owners} putdownLeadMinutes={15} />);
    const block = screen.getByTestId("timeline-block");
    expect(block).toHaveAttribute("data-owner", "parent1");
    const chip = screen.getByTestId("instant-chip");
    expect(chip).toHaveAttribute("data-owner", "other:daycare");
  });

  it("resolves owner refs to display names from OwnersConfig", () => {
    const events: Event[] = [ev({ id: "nap1", owner: { slot: "parent1" } })];
    render(<TimelineV3 events={events} owners={owners} putdownLeadMinutes={15} />);
    expect(screen.getByText(/Jake/)).toBeInTheDocument();
  });

  it("calls onEventTap with the parent event (never the synthetic putdown)", async () => {
    const onEventTap = vi.fn();
    const events: Event[] = [ev({ id: "nap1", hasPutdown: true })];
    render(
      <TimelineV3
        events={events}
        owners={owners}
        putdownLeadMinutes={15}
        onEventTap={onEventTap}
      />,
    );
    const blocks = screen.getAllByTestId("timeline-block");
    const napBlock = blocks.find((b) => b.getAttribute("data-type") === "nap");
    const putdownBlock = blocks.find((b) => b.getAttribute("data-type") === "putdown");
    expect(napBlock?.tagName).toBe("BUTTON");
    expect(putdownBlock?.tagName).toBe("DIV");
    await userEvent.click(napBlock!);
    expect(onEventTap).toHaveBeenCalledTimes(1);
    expect(onEventTap).toHaveBeenCalledWith(events[0]);
  });

  it("renders the now-bar when nowMinutes is provided", () => {
    render(
      <TimelineV3
        events={[ev({ id: "nap1" })]}
        owners={owners}
        putdownLeadMinutes={15}
        nowMinutes={9 * 60 + 30}
      />,
    );
    expect(screen.getByTestId("now-line")).toBeInTheDocument();
    expect(screen.getByTestId("now-pill")).toHaveTextContent("9:30 AM");
  });
});
