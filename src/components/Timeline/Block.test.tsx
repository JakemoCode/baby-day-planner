import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event } from "@/domain";
import { makeEvent } from "@/domain";
import { Block } from "./Block";

const wake: Event = makeEvent({
  id: "ww1",
  dayId: "d",
  eventKey: "wake_window_1",
  type: "wake_window",
  label: "Wake Window 1",
  startTime: "07:00",
  endTime: "09:00",
  owner: "Jake",
  source: "projected",
  status: "projected",
});

const nap: Event = makeEvent({
  id: "n1",
  dayId: "d",
  eventKey: "nap_1",
  type: "nap",
  label: "Nap 1",
  startTime: "09:00",
  endTime: "10:00",
  source: "projected",
  status: "projected",
});

const putdown: Event = makeEvent({
  id: "pd1",
  dayId: "d",
  eventKey: "nap_1_putdown",
  type: "putdown",
  label: "Start putting down for Nap 1",
  startTime: "08:45",
  endTime: "09:00",
  source: "projected",
  status: "projected",
});

const custom: Event = makeEvent({
  id: "ex1",
  dayId: "d",
  eventKey: "extra_1",
  type: "extra",
  label: "Friend visit",
  startTime: "15:30",
  endTime: "16:30",
  source: "manual",
  status: "completed",
});

const baseGeom = { topPx: 0, heightPx: 100, leftPx: 50, rightPx: 110 };

describe("<Block />", () => {
  it("renders the label and time range", () => {
    render(<Block event={wake} {...baseGeom} colorMode="type" past={false} />);
    expect(screen.getByText("Wake Window 1")).toBeVisible();
    expect(screen.getByText(/7:00–9:00 AM/)).toBeVisible();
  });

  it("shows the owner inline when present", () => {
    render(<Block event={wake} {...baseGeom} colorMode="type" past={false} />);
    expect(screen.getByText("· Jake")).toBeVisible();
  });

  it("abbreviates putdown labels to 'Putdown' (parent nap is positionally obvious)", () => {
    render(<Block event={putdown} {...baseGeom} colorMode="type" past={false} />);
    // Just "Putdown" plus the inline time — not "Putdown · Nap 1".
    expect(screen.getByText(/^Putdown$/)).toBeVisible();
  });

  it("renders extra-block start/end marker lines for custom blocks", () => {
    const { container } = render(
      <Block event={custom} {...baseGeom} colorMode="type" past={false} />,
    );
    // Two marker spans with data-edge top + bottom.
    expect(container.querySelectorAll('[data-edge="top"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-edge="bottom"]')).toHaveLength(1);
  });

  it("does NOT render marker lines for wake/nap/putdown", () => {
    const { container, rerender } = render(
      <Block event={nap} {...baseGeom} colorMode="type" past={false} />,
    );
    expect(container.querySelector('[data-edge="top"]')).toBeNull();
    rerender(<Block event={putdown} {...baseGeom} colorMode="type" past={false} />);
    expect(container.querySelector('[data-edge="top"]')).toBeNull();
  });

  it("exposes data-color-mode so CSS can swap fill/stripe rules", () => {
    const { rerender } = render(<Block event={wake} {...baseGeom} colorMode="type" past={false} />);
    expect(screen.getByTestId("timeline-block")).toHaveAttribute("data-color-mode", "type");
    rerender(<Block event={wake} {...baseGeom} colorMode="owner" past={false} />);
    expect(screen.getByTestId("timeline-block")).toHaveAttribute("data-color-mode", "owner");
  });

  it("marks past blocks with data-past for opacity styling", () => {
    render(<Block event={wake} {...baseGeom} colorMode="type" past={true} />);
    expect(screen.getByTestId("timeline-block")).toHaveAttribute("data-past", "true");
  });

  it("calls onClick when tapped", async () => {
    const onClick = vi.fn();
    render(<Block event={wake} {...baseGeom} colorMode="type" past={false} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: /Wake Window 1/ }));
    expect(onClick).toHaveBeenCalled();
  });

  it("renders as a non-interactive presentation div when onClick is omitted", () => {
    render(<Block event={wake} {...baseGeom} colorMode="type" past={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
