import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { NextSleepPanel } from "./NextSleepPanel";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [],
};

const nap = (overrides: Partial<Event> = {}): Event => ({
  id: `n-${overrides.startTime ?? 0}`,
  dayId: "d1",
  eventKey: `nap_${overrides.startTime ?? 0}`,
  type: "nap",
  kind: "block",
  label: "Nap",
  startTime: (overrides.startTime ?? 9 * 60) as TimeMin,
  endTime: ((overrides.startTime ?? 9 * 60) + 60) as TimeMin,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "recorded", annotatedAt: (overrides.startTime ?? 9 * 60) as TimeMin },
  ...overrides,
});

const projectedNap = (startTime: TimeMin): Event => ({
  id: "next",
  dayId: "d1",
  eventKey: "nap_next",
  type: "nap",
  kind: "block",
  label: "Nap",
  startTime,
  endTime: (startTime + 75) as TimeMin,
  hasPutdown: true,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
});

const projectedBedtime = (startTime: TimeMin): Event => ({
  id: "bt",
  dayId: "d1",
  eventKey: "bedtime",
  type: "bedtime",
  kind: "block",
  label: "Bedtime",
  startTime,
  endTime: (startTime + 660) as TimeMin,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
});

describe("NextSleepPanel", () => {
  it("renders putdown→nap pair with leadMinutes offset", () => {
    render(
      <NextSleepPanel
        nextNap={projectedNap((14 * 60 + 10) as TimeMin)}
        bedtime={projectedBedtime((19 * 60 + 30) as TimeMin)}
        actuals={[]}
        nowMinutes={(13 * 60) as TimeMin}
        putdownLeadMinutes={20}
        owners={owners}
      />,
    );
    expect(screen.getByText("2:10 PM")).toBeVisible();
    expect(screen.getByText(/putdown 1:50 PM/i)).toBeVisible();
    expect(screen.getByText(/bedtime 7:30 PM/i)).toBeVisible();
  });

  it("renders 'Last nap' line and today totals when prior naps exist", () => {
    const actuals: Event[] = [
      nap({ startTime: (9 * 60) as TimeMin, endTime: (10 * 60) as TimeMin }),
      nap({ startTime: (13 * 60) as TimeMin, endTime: (14 * 60 + 18) as TimeMin }),
    ];
    render(
      <NextSleepPanel
        nextNap={undefined}
        bedtime={projectedBedtime((19 * 60 + 30) as TimeMin)}
        actuals={actuals}
        nowMinutes={(15 * 60 + 5) as TimeMin}
        putdownLeadMinutes={20}
        owners={owners}
      />,
    );
    expect(screen.queryByText(/putdown/i)).toBeNull();
    expect(screen.getByText(/last nap: 1h 18m, 47 min ago \(2:18p\)/i)).toBeVisible();
    expect(screen.getByText(/today: 2 naps · 2h 18m/i)).toBeVisible();
    expect(screen.getByText(/bedtime 7:30 PM/i)).toBeVisible();
  });

  it("hides 'Last nap' when no completed nap yet today", () => {
    render(
      <NextSleepPanel
        nextNap={projectedNap((9 * 60 + 30) as TimeMin)}
        bedtime={projectedBedtime((19 * 60 + 30) as TimeMin)}
        actuals={[]}
        nowMinutes={(8 * 60) as TimeMin}
        putdownLeadMinutes={20}
        owners={owners}
      />,
    );
    expect(screen.queryByText(/last nap:/i)).toBeNull();
    expect(screen.getByText(/today: 0 naps · 0m/i)).toBeVisible();
  });

  it("hides bedtime footer line when bedtime prop is undefined", () => {
    render(
      <NextSleepPanel
        nextNap={projectedNap((9 * 60 + 30) as TimeMin)}
        bedtime={undefined}
        actuals={[]}
        nowMinutes={(8 * 60) as TimeMin}
        putdownLeadMinutes={20}
        owners={owners}
      />,
    );
    expect(screen.queryByText(/bedtime \d/i)).toBeNull();
  });
});
