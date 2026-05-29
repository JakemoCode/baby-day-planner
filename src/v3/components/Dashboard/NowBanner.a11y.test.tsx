import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { axe } from "@/test-utils";
import { NowBanner } from "./NowBanner";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [],
};

const napEvent = (start: TimeMin): Event => ({
  id: "n1",
  dayId: "d1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  label: "Nap",
  startTime: start,
  endTime: (start + 60) as TimeMin,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "recorded", annotatedAt: start },
});

describe("NowBanner a11y", () => {
  it("has no axe violations when nap is in progress", async () => {
    const { container } = render(
      <NowBanner
        inProgressNap={napEvent((13 * 60) as TimeMin)}
        owners={owners}
        nowMinutes={(13 * 60 + 47) as TimeMin}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
