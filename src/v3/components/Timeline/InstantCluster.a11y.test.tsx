import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Event, OwnersConfig } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { InstantCluster } from "./InstantCluster";
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
  type: "bottle",
  kind: "instant",
  startTime: 9 * 60,
  label: "Bottle",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("InstantCluster a11y", () => {
  it("has no structural a11y violations", async () => {
    const { container } = render(
      <InstantCluster
        items={[ev({ id: "a" }), ev({ id: "b", label: "Vitamin", startTime: 9 * 60 + 5 })]}
        topPx={100}
        rightPx={4}
        widthPx={140}
        leaderWidthPx={8}
        owners={owners}
        colorMode="type"
        past={false}
        onEventTap={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
