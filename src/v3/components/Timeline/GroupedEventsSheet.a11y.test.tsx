import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import type { Event, OwnersConfig } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { GroupedEventsSheet } from "./GroupedEventsSheet";
import { axe } from "@/test-utils";
import { expect } from "vitest";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const ev = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "x",
  type: "bottle",
  kind: "instant",
  startTime: 0,
  label: "x",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("GroupedEventsSheet a11y (open)", () => {
  it("has no structural a11y violations when sheet is open", async () => {
    const { container } = render(
      <GroupedEventsSheet
        open
        items={[
          ev({ id: "a", label: "Vitamin", startTime: 9 * 60 + 30 }),
          ev({ id: "b", label: "Diaper", startTime: 9 * 60 + 35 }),
        ]}
        startMinutes={9 * 60 + 30}
        endMinutes={9 * 60 + 35}
        owners={owners}
        onCancel={() => {}}
        onTapEvent={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
