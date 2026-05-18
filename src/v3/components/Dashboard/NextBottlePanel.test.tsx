import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { NextBottlePanel } from "./NextBottlePanel";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [],
};

const bottle = (overrides: Partial<Event> = {}): Event => ({
  id: `b-${overrides.startTime ?? 0}`,
  dayId: "d1",
  eventKey: `bottle_${overrides.startTime ?? 0}`,
  type: "bottle",
  kind: "instant",
  label: "Bottle",
  startTime: (overrides.startTime ?? 7 * 60) as TimeMin,
  amountOz: 4,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "recorded", annotatedAt: (overrides.startTime ?? 7 * 60) as TimeMin },
  ...overrides,
});

const nextProjected = (startTime: TimeMin): Event => ({
  id: "next",
  dayId: "d1",
  eventKey: "bottle_next",
  type: "bottle",
  kind: "instant",
  label: "Bottle",
  startTime,
  amountOz: 5,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
});

describe("NextBottlePanel", () => {
  it("renders next-bottle line, based-on-last line, and totals when full data is present", () => {
    const actuals: Event[] = [
      bottle({ startTime: (7 * 60) as TimeMin, amountOz: 4 }),
      bottle({ startTime: (10 * 60) as TimeMin, amountOz: 5 }),
    ];
    render(
      <NextBottlePanel
        nextBottle={nextProjected((13 * 60) as TimeMin)}
        actuals={actuals}
        nowMinutes={(11 * 60) as TimeMin}
        owners={owners}
      />,
    );
    expect(screen.getByLabelText("Bottle stats")).toBeVisible();
    expect(screen.getByText("1:00 PM")).toBeVisible();
    expect(screen.getByText(/in 2h/i)).toBeVisible();
    expect(screen.getByText(/last: 5oz, 60 min ago \(10a\)/i)).toBeVisible();
    expect(screen.getByText(/today: 2 bottles · 9oz/i)).toBeVisible();
  });

  it("hides hero time row when no next bottle is available", () => {
    render(
      <NextBottlePanel
        nextBottle={undefined}
        actuals={[bottle({ startTime: (7 * 60) as TimeMin, amountOz: 4 })]}
        nowMinutes={(20 * 60) as TimeMin}
        owners={owners}
      />,
    );
    expect(screen.queryByText(/in \d/i)).toBeNull();
    expect(screen.getByText(/last: 4oz/i)).toBeVisible();
    expect(screen.getByText(/today: 1 bottle · 4oz/i)).toBeVisible();
  });

  it("hides 'Last' line when no recorded bottle yet today", () => {
    render(
      <NextBottlePanel
        nextBottle={nextProjected((7 * 60) as TimeMin)}
        actuals={[]}
        nowMinutes={(6 * 60 + 30) as TimeMin}
        owners={owners}
      />,
    );
    expect(screen.queryByText(/^last:/i)).toBeNull();
    expect(screen.getByText(/today: 0 bottles · 0oz/i)).toBeVisible();
  });
});
