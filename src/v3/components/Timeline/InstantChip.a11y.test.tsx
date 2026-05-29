import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import type { Event, OwnersConfig } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { InstantChip } from "./InstantChip";
import { axe } from "@/test-utils";
import { expect } from "vitest";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Sam" },
  other: [],
};

const bottleEvent: Event = {
  id: "bot1",
  dayId: "d-1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 7 * 60 + 30,
  label: "Bottle 1",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
};

describe("InstantChip a11y", () => {
  it("has no structural a11y violations (interactive chip)", async () => {
    const { container } = render(
      <InstantChip
        event={bottleEvent}
        owners={owners}
        colorMode="type"
        onClick={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
