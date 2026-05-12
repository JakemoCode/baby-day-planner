/**
 * V3 TomorrowPreview — renders TimelineV3 over a synthesized planned
 * Day + Settings (+ optional template + extras), using the V3 engine.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Day, OwnersConfig, OwnershipTemplate } from "../../schemas";
import { aSettings } from "../../__tests__/factories";
import { TomorrowPreview } from "./TomorrowPreview";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};

const settings = aSettings({ childId: "child-1", owners });

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
