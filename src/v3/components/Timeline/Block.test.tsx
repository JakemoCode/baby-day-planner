import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { formatRangeShort } from "../../ui/time";
import { Block } from "./Block";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake" },
  parent2: { displayName: "Sam" },
  other: [],
};

const extraEvent: Event = {
  id: "x1",
  dayId: "d-1",
  eventKey: "extra_walk",
  type: "extra",
  kind: "block",
  startTime: 12 * 60 + 45,
  endTime: 13 * 60 + 15,
  label: "Walk dog",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
};

function renderExtra(heightPx: number) {
  return render(
    <Block
      event={extraEvent}
      topPx={0}
      heightPx={heightPx}
      owners={owners}
      colorMode="type"
      past={false}
      leftPx={0}
      rightPx={0}
    />,
  );
}

const range = formatRangeShort(12 * 60 + 45, 13 * 60 + 15);

describe("Block — extra-with-duration", () => {
  it("shows the time range when the block is tall enough", () => {
    renderExtra(120);
    expect(screen.getByText("Walk dog")).toBeVisible();
    expect(screen.getByText(range)).toBeVisible();
  });

  it("drops the time range on a short block so the title stays visible", () => {
    renderExtra(40);
    expect(screen.getByText("Walk dog")).toBeVisible();
    expect(screen.queryByText(range)).toBeNull();
  });
});
