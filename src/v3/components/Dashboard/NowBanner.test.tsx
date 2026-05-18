import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NowBanner } from "./NowBanner";

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
  startTime: (7 * 60) as TimeMin,
  endTime: (9 * 60) as TimeMin,
  hasPutdown: false,
  lifecycle: { state: "projected" },
  ...overrides,
});

const napEvent = (start: TimeMin): Event => ({
  id: "n1",
  dayId: "d1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  label: "Nap",
  startTime: start,
  endTime: (start + 60) as TimeMin,
  hasPutdown: false,
  lifecycle: { state: "recorded", at: start },
});

const bedtimeEvent = (start: TimeMin): Event => ({
  id: "bt",
  dayId: "d1",
  eventKey: "bedtime",
  type: "bedtime",
  kind: "block",
  label: "Bedtime",
  startTime: start,
  endTime: (start + 600) as TimeMin,
  hasPutdown: false,
  lifecycle: { state: "recorded", at: start },
});

describe("NowBanner", () => {
  it("renders wake-window label and end time when only wake_window is active", () => {
    render(<NowBanner wakeWindow={ww()} owners={owners} nowMinutes={(8 * 60) as TimeMin} />);
    expect(screen.getByText(/in wake window 1/i)).toBeVisible();
    expect(screen.getByText(/ends 9:00 AM/i)).toBeVisible();
  });

  it("renders 'Nap in progress — Xm' when an in-progress nap is passed", () => {
    render(
      <NowBanner
        wakeWindow={ww()}
        inProgressNap={napEvent((13 * 60) as TimeMin)}
        owners={owners}
        nowMinutes={(13 * 60 + 47) as TimeMin}
      />,
    );
    expect(screen.getByText(/nap in progress/i)).toBeVisible();
    expect(screen.getByText(/47m/)).toBeVisible();
    expect(screen.queryByText(/in wake window/i)).toBeNull();
  });

  it("renders 'Bedtime in progress — Xh Ym' when an in-progress bedtime is passed", () => {
    render(
      <NowBanner
        inProgressBedtime={bedtimeEvent((19 * 60 + 30) as TimeMin)}
        owners={owners}
        nowMinutes={(20 * 60 + 42) as TimeMin}
      />,
    );
    expect(screen.getByText(/bedtime in progress/i)).toBeVisible();
    expect(screen.getByText(/1h 12m/)).toBeVisible();
  });

  it("prefers bedtime over nap when both are somehow passed", () => {
    render(
      <NowBanner
        inProgressNap={napEvent((13 * 60) as TimeMin)}
        inProgressBedtime={bedtimeEvent((19 * 60 + 30) as TimeMin)}
        owners={owners}
        nowMinutes={(20 * 60) as TimeMin}
      />,
    );
    expect(screen.getByText(/bedtime in progress/i)).toBeVisible();
    expect(screen.queryByText(/nap in progress/i)).toBeNull();
  });

  it("renders nothing when nothing is active", () => {
    const { container } = render(<NowBanner owners={owners} nowMinutes={(8 * 60) as TimeMin} />);
    expect(container.textContent).toBe("");
  });
});
