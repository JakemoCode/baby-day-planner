/**
 * Seam: pump drawer save → pumpTotalOz → PumpVolumeCard, with REAL implementations
 * of all three. Per-layer unit tests pass independently; this proves the chain that
 * turns a recorded volume into the dashboard total actually composes.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { EventEditDrawerV3 } from "@/v3/components/shared/EventEditDrawerV3";
import { pumpTotalOz } from "./dashboardStats";
import { PumpVolumeCard } from "./PumpVolumeCard";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Sam", color: "#f0a" },
  other: [],
};
const NOW = (8 * 60 + 30) as TimeMin;

const projectedPump = (overrides: Partial<Event> = {}): Event => ({
  id: "pump-1",
  dayId: "d-1",
  eventKey: "pump_1",
  type: "pump",
  kind: "block",
  startTime: 8 * 60,
  endTime: 8 * 60 + 20,
  label: "Pump",
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("seam: pump volume entry flows to the dashboard total", () => {
  it("recording 2.5 + 3.25 in the drawer surfaces 5.75 oz on the card", async () => {
    let saved: Event | undefined;
    render(
      <EventEditDrawerV3
        open
        mode="edit"
        event={projectedPump()}
        owners={owners}
        nowMinutes={NOW}
        bedtimeThreshold={(19 * 60) as TimeMin}
        defaultWakeTime={(7 * 60) as TimeMin}
        onSave={(e) => {
          saved = e;
        }}
        onCancel={() => {}}
      />,
    );

    await userEvent.clear(screen.getByLabelText("Left"));
    await userEvent.type(screen.getByLabelText("Left"), "2.5");
    await userEvent.clear(screen.getByLabelText("Right"));
    await userEvent.type(screen.getByLabelText("Right"), "3.25");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(saved).toBeDefined();
    const total = pumpTotalOz([saved as Event]);
    render(<PumpVolumeCard totalOz={total} />);
    expect(screen.getByText("5.75 oz")).toBeVisible();
  });
});
