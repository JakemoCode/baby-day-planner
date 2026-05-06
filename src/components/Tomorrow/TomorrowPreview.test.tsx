import { describe, it, expect } from "vitest";
import type { Day, OwnershipTemplate, Settings } from "@/domain";
import { renderWithAuth, screen } from "@/test-utils";
import { TomorrowPreview } from "./TomorrowPreview";

const settings: Settings = {
  childId: "child-1",
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  defaultNapLengthMinutes: 60,
  putdownLeadMinutes: 15,
  bedtimeThreshold: "19:00",
  shortNapThresholdMinutes: 35,
  shortNapAdjustmentMinutes: 10,
  wakeWindowsMinutes: [120, 135, 135, 150],
  bottleRules: [
    { minOz: 0, maxOz: 5.5, intervalMinutes: 150 },
    { minOz: 5.6, intervalMinutes: 180 },
  ],
  dreamFeed: {
    enabled: true,
    earliestTime: "20:30",
    latestTime: "21:00",
    minMinutesAfterBedtime: 90,
  },
  pumpTimes: ["10:30", "14:30"],
};

const tomorrowDay: Day = {
  id: "day-tomorrow",
  childId: "child-1",
  date: "2026-05-06",
  status: "planned",
  wakeTime: "07:00",
  createdAt: "2026-05-05T22:00:00Z",
};

describe("TomorrowPreview", () => {
  it("prompts for wake time when none is set", () => {
    const { wakeTime: _omit, ...incomplete } = tomorrowDay;
    renderWithAuth(<TomorrowPreview day={incomplete} settings={settings} />);
    expect(screen.getByText(/set.*wake time/i)).toBeInTheDocument();
  });

  it("renders a TimelineList when day is complete", () => {
    renderWithAuth(<TomorrowPreview day={tomorrowDay} settings={settings} />);
    // At least one DurationBlock (Nap 1) should exist
    expect(screen.getAllByTestId("duration-block").length).toBeGreaterThan(0);
    // At least one PointMarker (Wake) should exist
    expect(screen.getAllByTestId("point-marker").length).toBeGreaterThan(0);
  });

  it("applies template owners to naps", () => {
    const template: OwnershipTemplate = {
      id: "tmpl-saturday",
      label: "Saturday",
      napOwners: ["Kelly", "Jake", "Kelly", "Jake"],
      wakeWindowOwners: ["Jake", "Kelly", "Jake", "Kelly"],
    };
    renderWithAuth(<TomorrowPreview day={tomorrowDay} settings={settings} template={template} />);
    // Find Nap 1 specifically (first nap-typed block)
    const napBlocks = screen
      .getAllByTestId("duration-block")
      .filter((el) => el.dataset.eventType === "nap");
    expect(napBlocks[0]?.dataset.owner).toBe("Kelly");
    // And Wake Window 1 should be tinted Jake
    const wwBlocks = screen
      .getAllByTestId("duration-block")
      .filter((el) => el.dataset.eventType === "wake_window");
    expect(wwBlocks[0]?.dataset.owner).toBe("Jake");
  });

  it("includes Bottle 1 in the preview when bottle1Time is provided", () => {
    renderWithAuth(<TomorrowPreview day={tomorrowDay} settings={settings} bottle1Time="07:05" />);
    expect(screen.getByText(/Bottle 1/)).toBeInTheDocument();
  });

  it("includes user-added extras in the preview", () => {
    const extras = [
      {
        id: "extra-1",
        dayId: tomorrowDay.id,
        eventKey: "extra_1",
        type: "extra" as const,
        label: "Pediatrician",
        startTime: "11:00",
        source: "manual" as const,
        status: "completed" as const,
      },
    ];
    renderWithAuth(<TomorrowPreview day={tomorrowDay} settings={settings} extras={extras} />);
    expect(screen.getByText("Pediatrician")).toBeInTheDocument();
  });
});
