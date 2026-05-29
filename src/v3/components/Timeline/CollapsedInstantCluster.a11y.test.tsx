import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Event } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import { CollapsedInstantCluster } from "./CollapsedInstantCluster";
import { axe } from "@/test-utils";

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

describe("CollapsedInstantCluster a11y", () => {
  it("has no structural a11y violations", async () => {
    const { container } = render(
      <CollapsedInstantCluster
        items={[ev({ id: "a" }), ev({ id: "b" })]}
        startMinutes={9 * 60 + 30}
        endMinutes={9 * 60 + 35}
        topPx={100}
        rightPx={4}
        widthPx={140}
        leaderWidthPx={8}
        past={false}
        onTap={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
