import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
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
  lifecycle: { state: "recorded", at: (overrides.startTime ?? 9 * 60) as TimeMin },
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
    expect(screen.getByText(/putdown 1:50 PM → nap 2:10 PM/i)).toBeVisible();
    expect(screen.getByText(/projected bedtime: 7:30 PM/i)).toBeVisible();
  });

  it("renders 'based on last nap' line and today totals when prior naps exist", () => {
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
    expect(screen.getByText(/based on last nap: 1h 18m, 47 min ago \(2:18p\)/i)).toBeVisible();
    expect(screen.getByText(/today: 2 naps, 2h 18m/i)).toBeVisible();
    expect(screen.getByText(/projected bedtime: 7:30 PM/i)).toBeVisible();
  });

  it("hides 'based on last nap' when no completed nap yet today", () => {
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
    expect(screen.queryByText(/based on last/i)).toBeNull();
    expect(screen.getByText(/today: 0 naps, 0m/i)).toBeVisible();
  });

  it("hides projected-bedtime line when bedtime prop is undefined", () => {
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
    expect(screen.queryByText(/projected bedtime/i)).toBeNull();
  });
});
