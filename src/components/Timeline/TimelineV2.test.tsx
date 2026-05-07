import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event } from "@/domain";
import { makeEvent } from "@/domain";
import { TimelineV2 } from "./TimelineV2";

const wake1: Event = makeEvent({
  id: "ww1",
  dayId: "d",
  eventKey: "wake_window_1",
  type: "wake_window",
  label: "Wake Window 1",
  startTime: "07:00",
  endTime: "09:00",
  source: "projected",
  status: "projected",
  owner: "Jake",
});

const nap1: Event = makeEvent({
  id: "n1",
  dayId: "d",
  eventKey: "nap_1",
  type: "nap",
  label: "Nap 1",
  startTime: "09:00",
  endTime: "10:30",
  source: "projected",
  status: "projected",
});

const bottle: Event = makeEvent({
  id: "b1",
  dayId: "d",
  eventKey: "bottle_1",
  type: "bottle",
  label: "Bottle 1",
  startTime: "07:30",
  amountOz: 5,
  source: "actual",
  status: "actual",
});

const pumpAt7: Event = makeEvent({
  id: "p7",
  dayId: "d",
  eventKey: "pump_07:00",
  type: "pump",
  label: "Pump",
  startTime: "07:00",
  source: "manual",
  status: "completed",
});

const wakeInstant: Event = makeEvent({
  id: "wake-event",
  dayId: "d",
  eventKey: "wake",
  type: "wake",
  label: "Wake",
  startTime: "07:00",
  source: "projected",
  status: "projected",
});

describe("<TimelineV2 />", () => {
  it("renders empty-state when there are no events", () => {
    render(<TimelineV2 events={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Nothing scheduled/);
  });

  it("renders one block per duration event", () => {
    render(<TimelineV2 events={[wake1, nap1]} />);
    expect(screen.getAllByTestId("timeline-block")).toHaveLength(2);
  });

  it("renders one cluster per distinct instant time, fanning concurrent items", () => {
    render(<TimelineV2 events={[wake1, nap1, pumpAt7, bottle]} />);
    // Two distinct times → two clusters; 7:00 has its own (pump), 7:30 has its own (bottle).
    expect(screen.getAllByTestId("instant-cluster")).toHaveLength(2);
  });

  it("filters out a wake-instant that coincides with WW1's start (§11.A)", () => {
    // Both wake_window_1 and the 'wake' instant fire at 07:00. Only the
    // block should remain — the 'wake' chip would be redundant.
    render(<TimelineV2 events={[wake1, wakeInstant]} />);
    expect(screen.queryAllByTestId("instant-cluster")).toHaveLength(0);
  });

  it("renders the now bar when nowMinutes is provided", () => {
    render(<TimelineV2 events={[wake1, nap1]} nowMinutes={8 * 60 + 15} />);
    expect(screen.getByTestId("now-line")).toBeInTheDocument();
    expect(screen.getByTestId("now-pill")).toBeInTheDocument();
  });

  it("does NOT render the now bar when nowMinutes is omitted (history/templates/tomorrow)", () => {
    render(<TimelineV2 events={[wake1, nap1]} />);
    expect(screen.queryByTestId("now-line")).toBeNull();
  });

  it("propagates onEventTap to blocks and chips", async () => {
    const onEventTap = vi.fn();
    render(<TimelineV2 events={[wake1, bottle]} onEventTap={onEventTap} />);
    await userEvent.click(screen.getByRole("button", { name: /Wake Window 1/ }));
    expect(onEventTap).toHaveBeenCalledWith(wake1);
    await userEvent.click(screen.getByRole("button", { name: /Bottle 1 at 7:30 AM/ }));
    expect(onEventTap).toHaveBeenCalledWith(bottle);
  });

  it("dims past blocks/clusters when dimPast and nowMinutes are provided", () => {
    // Bottle at 7:30, now=8:00 → past → cluster gets data-past=true
    render(<TimelineV2 events={[wake1, bottle]} nowMinutes={8 * 60} dimPast={true} />);
    expect(screen.getByTestId("instant-cluster")).toHaveAttribute("data-past", "true");
  });

  it("respects pxPerHour for vertical spacing (denser hours = shorter total height)", () => {
    const dense = render(
      <TimelineV2 events={[wake1, nap1]} pxPerHour={70} />,
    ).container.querySelector('[class*="inner"]') as HTMLElement;
    const denseHeight = parseFloat(dense.style.height);
    const sparse = render(
      <TimelineV2 events={[wake1, nap1]} pxPerHour={220} />,
    ).container.querySelector('[class*="inner"]') as HTMLElement;
    const sparseHeight = parseFloat(sparse.style.height);
    expect(sparseHeight).toBeGreaterThan(denseHeight);
  });
});
