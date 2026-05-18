import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig } from "@/v3/schemas";
import { CurrentWakeWindowStatus } from "./CurrentWakeWindowStatus";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [],
};

const ww = (overrides: Partial<Event> = {}): Event => ({
  id: "ww1",
  dayId: "d1",
  eventKey: "wake_window_1",
  type: "wake_window",
  kind: "block",
  label: "Wake Window 1",
  startTime: 7 * 60,
  endTime: 9 * 60,
  hasPutdown: false,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("CurrentWakeWindowStatus", () => {
  it("renders the label and end time when in a window", () => {
    render(<CurrentWakeWindowStatus wakeWindow={ww()} owners={owners} />);
    expect(screen.getByText(/in wake window 1/i)).toBeVisible();
    expect(screen.getByText(/ends 9:00 AM/i)).toBeVisible();
  });

  it("includes owner display name when set", () => {
    render(
      <CurrentWakeWindowStatus wakeWindow={ww({ owner: { slot: "parent2" } })} owners={owners} />,
    );
    expect(screen.getByText(/Kelly/)).toBeVisible();
  });

  it("renders nothing when not in a wake window", () => {
    const { container } = render(
      <CurrentWakeWindowStatus wakeWindow={undefined} owners={owners} />,
    );
    expect(container.textContent).toBe("");
  });
});
