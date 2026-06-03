import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { axe } from "@/test-utils";
import { NextSleepPanel } from "./NextSleepPanel";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [],
};

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

describe("NextSleepPanel a11y", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <NextSleepPanel
        nextSleep={projectedNap((14 * 60 + 10) as TimeMin)}
        bedtime={projectedBedtime((19 * 60 + 30) as TimeMin)}
        actuals={[]}
        nowMinutes={(13 * 60) as TimeMin}
        putdownLeadMinutes={20}
        owners={owners}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations when bedtime is the next sleep", async () => {
    const bedtime = projectedBedtime((19 * 60 + 30) as TimeMin);
    const { container } = render(
      <NextSleepPanel
        nextSleep={bedtime}
        bedtime={bedtime}
        actuals={[]}
        nowMinutes={(17 * 60) as TimeMin}
        putdownLeadMinutes={20}
        owners={owners}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
