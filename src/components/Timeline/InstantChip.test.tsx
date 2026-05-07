import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event } from "@/domain";
import { makeEvent } from "@/domain";
import { InstantChip } from "./InstantChip";
import { InstantCluster } from "./InstantCluster";

const bottle: Event = makeEvent({
  id: "b1",
  dayId: "d",
  eventKey: "bottle_1",
  type: "bottle",
  label: "Bottle 1",
  startTime: "07:00",
  amountOz: 5,
  source: "actual",
  status: "actual",
});

const pump: Event = makeEvent({
  id: "p1",
  dayId: "d",
  eventKey: "pump_07:00",
  type: "pump",
  label: "Pump",
  startTime: "07:00",
  source: "manual",
  status: "completed",
});

describe("<InstantChip />", () => {
  it("renders the per-event label (numbered for bottles) and the short time", () => {
    render(<InstantChip event={bottle} colorMode="type" />);
    // Jake wants "Bottle 1" preserved on chips (per-event ordinal).
    expect(screen.getByText("Bottle 1")).toBeVisible();
    // Short time form per design ("7a" / "10:30a" / "1:05p").
    expect(screen.getByText("7a")).toBeVisible();
  });

  it("renders dream_feed with its own label (not collapsed to Pump)", () => {
    const df = makeEvent({
      ...bottle,
      type: "dream_feed",
      eventKey: "dream_feed",
      label: "Dream Feed",
    });
    render(<InstantChip event={df} colorMode="type" />);
    expect(screen.getByText("Dream Feed")).toBeVisible();
  });

  it("propagates colorMode + owner via data-attributes", () => {
    const owned = makeEvent({ ...bottle, owner: "Kelly" });
    render(<InstantChip event={owned} colorMode="owner" />);
    const chip = screen.getByTestId("instant-chip");
    expect(chip).toHaveAttribute("data-color-mode", "owner");
    expect(chip).toHaveAttribute("data-owner", "Kelly");
  });

  it("calls onClick when tapped", async () => {
    const onClick = vi.fn();
    render(<InstantChip event={bottle} colorMode="type" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: /Bottle 1 at 7a/ }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("<InstantCluster />", () => {
  it("renders one chip per item, all in a single horizontal row container", () => {
    render(
      <InstantCluster
        items={[bottle, pump]}
        topPx={100}
        rightPx={0}
        widthPx={104}
        leaderWidthPx={8}
        colorMode="type"
        past={false}
      />,
    );
    expect(screen.getAllByTestId("instant-chip")).toHaveLength(2);
    // The cluster is one container — concurrent chips don't sit at different y.
    expect(screen.getAllByTestId("instant-cluster")).toHaveLength(1);
  });

  it("marks past clusters with data-past for opacity styling", () => {
    render(
      <InstantCluster
        items={[bottle]}
        topPx={100}
        rightPx={0}
        widthPx={104}
        leaderWidthPx={8}
        colorMode="type"
        past={true}
      />,
    );
    expect(screen.getByTestId("instant-cluster")).toHaveAttribute("data-past", "true");
  });

  it("forwards onEventTap to chips, firing with the right event", async () => {
    const onEventTap = vi.fn();
    render(
      <InstantCluster
        items={[bottle, pump]}
        topPx={100}
        rightPx={0}
        widthPx={104}
        leaderWidthPx={8}
        colorMode="type"
        past={false}
        onEventTap={onEventTap}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Pump at 7a/ }));
    expect(onEventTap).toHaveBeenCalledWith(pump);
  });
});
