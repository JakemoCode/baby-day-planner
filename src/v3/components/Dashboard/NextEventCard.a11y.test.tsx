import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { axe } from "@/test-utils";
import { NextEventCard } from "./NextEventCard";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [],
};

const napEvent: Event = {
  id: "e1",
  dayId: "day-1",
  eventKey: "nap_2",
  type: "nap",
  kind: "block",
  label: "Nap 2",
  startTime: (9 * 60 + 30) as TimeMin,
  endTime: (10 * 60 + 15) as TimeMin,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
};

describe("NextEventCard a11y", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <NextEventCard
        event={napEvent}
        nowMinutes={(9 * 60 + 18) as TimeMin}
        owners={owners}
        putdownLeadMinutes={20}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
