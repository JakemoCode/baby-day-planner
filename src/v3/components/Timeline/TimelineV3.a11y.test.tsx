import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Event, OwnersConfig } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { TimelineV3 } from "./TimelineV3";
import { axe } from "@/test-utils";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Sam" },
  other: [],
};

const ev = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "x",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("TimelineV3 a11y", () => {
  it("has no structural a11y violations with a block and an instant event", async () => {
    const events: Event[] = [
      ev({ id: "nap1" }),
      ev({
        id: "bot1",
        type: "bottle",
        kind: "instant",
        startTime: 7 * 60 + 30,
        label: "Bottle 1",
      }),
    ];
    const { container } = render(<TimelineV3 events={events} owners={owners} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
