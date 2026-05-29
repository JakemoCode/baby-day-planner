import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { axe } from "@/test-utils";
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

describe("NextBottlePanel a11y", () => {
  it("has no axe violations", async () => {
    const actuals: Event[] = [
      bottle({ startTime: (7 * 60) as TimeMin, amountOz: 4 }),
      bottle({ startTime: (10 * 60) as TimeMin, amountOz: 5 }),
    ];
    const { container } = render(
      <NextBottlePanel
        nextBottle={nextProjected((13 * 60) as TimeMin)}
        actuals={actuals}
        nowMinutes={(11 * 60) as TimeMin}
        owners={owners}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
