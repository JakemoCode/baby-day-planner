import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import type { Event, OwnersConfig } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { Block } from "./Block";
import { axe } from "@/test-utils";
import { expect } from "vitest";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Sam" },
  other: [],
};

const napEvent: Event = {
  id: "nap1",
  dayId: "d-1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
};

describe("Block a11y", () => {
  it("has no structural a11y violations (interactive block with onClick)", async () => {
    const { container } = render(
      <Block
        event={napEvent}
        topPx={100}
        heightPx={60}
        owners={owners}
        colorMode="type"
        past={false}
        onClick={() => {}}
        leftPx={48}
        rightPx={4}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
