import { describe, it, expect } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen } from "@/test-utils";
import { CurrentWakeWindowStatus } from "./CurrentWakeWindowStatus";

const ww = (overrides: Partial<Event> = {}): Event => ({
  id: "ww1",
  dayId: "d1",
  eventKey: "wake_window_1",
  type: "wake_window",
  kind: "block",
  label: "Wake Window 1",
  startTime: "07:00",
  endTime: "09:00",
  source: "projected",
  status: "projected",
  ...overrides,
});

describe("CurrentWakeWindowStatus", () => {
  it("renders 'In WW1 · ends 9:00 AM' when in a window", () => {
    renderWithAuth(<CurrentWakeWindowStatus wakeWindow={ww()} />);
    expect(screen.getByText(/in wake window 1/i)).toBeVisible();
    expect(screen.getByText(/ends 9:00 AM/i)).toBeVisible();
  });

  it("includes owner when set", () => {
    renderWithAuth(<CurrentWakeWindowStatus wakeWindow={ww({ owner: "Kelly" })} />);
    expect(screen.getByText(/kelly/i)).toBeVisible();
  });

  it("renders nothing when not in a wake window", () => {
    const { container } = renderWithAuth(<CurrentWakeWindowStatus wakeWindow={undefined} />);
    expect(container.textContent).toBe("");
  });
});
