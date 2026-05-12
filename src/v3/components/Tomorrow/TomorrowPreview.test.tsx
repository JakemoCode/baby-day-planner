/**
 * V3 TomorrowPreview — renders TimelineV3 over a synthesized planned
 * Day + Settings (+ optional template + extras), using the V3 engine.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Day, OwnersConfig, OwnershipTemplate, Settings } from "../../schemas";
import { TomorrowPreview } from "./TomorrowPreview";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const settings: Settings = {
  childId: "child-1",
  defaultWakeTime: 7 * 60,
  bedtimeThreshold: 19 * 60,
  defaultNapLengthMinutes: 60,
  shortNapThresholdMinutes: 35,
  shortNapAdjustmentMinutes: 10,
  wakeWindowsMinutes: [120, 135, 135, 150],
  napDurationMin: 30,
  napDurationMax: 180,
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  bottleRules: [],
  bottleIntervalRules: [],
  bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
  minBottleIntervalMinutes: 90,
  putdownLeadMinutes: 15,
  pumpTimes: [],
  pumpOwnerSlot: "parent2",
  dreamFeedEnabled: false,
  dreamFeedStart: 22 * 60,
  dreamFeedEnd: 23 * 60,
  dreamFeedOffsetAfterBedtimeMinutes: 180,
  dailyRecurring: [],
  daycare: {
    enabled: false,
    dropoffTime: 8 * 60,
    pickupTime: 17 * 60,
    ownerId: "",
    weekdays: {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    },
  },
  owners,
  timelineColorMode: "type",
  timelinePxPerHour: 80,
  timelineDimPast: false,
};

const tomorrowDay: Day = {
  id: "day-tomorrow",
  childId: "child-1",
  date: "2026-05-10",
  status: "planned",
  wakeTime: 7 * 60,
  suppressedRecurringIds: [],
  suppressedDaycareDay: false,
};

describe("TomorrowPreview (V3)", () => {
  it("prompts for wake time when day.wakeTime is undefined", () => {
    const incomplete: Day = { ...tomorrowDay };
    delete (incomplete as { wakeTime?: number }).wakeTime;
    render(<TomorrowPreview day={incomplete} settings={settings} owners={owners} />);
    expect(screen.getByText(/set.*wake time/i)).toBeVisible();
  });

  it("renders a TimelineV3 with projected events for a complete plan", () => {
    render(<TomorrowPreview day={tomorrowDay} settings={settings} owners={owners} />);
    // Engine projects at least one nap block when wakeWindowsMinutes is set.
    expect(screen.getAllByTestId("timeline-block").length).toBeGreaterThan(0);
  });

  it("applies the supplied template to the projection", () => {
    const template: OwnershipTemplate = {
      id: "tmpl-saturday",
      displayName: "Saturday",
      napOwners: [{ slot: "parent2" }, { slot: "parent1" }],
      wakeWindowOwners: [{ slot: "parent1" }, { slot: "parent2" }],
    };
    render(
      <TomorrowPreview day={tomorrowDay} settings={settings} owners={owners} template={template} />,
    );
    const napBlocks = screen
      .getAllByTestId("timeline-block")
      .filter((el) => el.dataset.type === "nap");
    expect(napBlocks[0]?.dataset.owner).toBe("parent2");
  });

  it("includes user-supplied extras in the projection", () => {
    const extras = [
      {
        id: "extra-1",
        dayId: tomorrowDay.id,
        eventKey: "extra_1",
        type: "extra" as const,
        kind: "instant" as const,
        startTime: 11 * 60,
        label: "Pediatrician",
        hasPutdown: false,
        lifecycle: { state: "completed" as const, committedAt: 11 * 60 },
      },
    ];
    render(
      <TomorrowPreview day={tomorrowDay} settings={settings} owners={owners} extras={extras} />,
    );
    expect(screen.getByText("Pediatrician")).toBeVisible();
  });
});
