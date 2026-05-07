import { describe, it, expect } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen } from "@/test-utils";
import { NextNapPreview } from "./NextNapPreview";

const nap = (overrides: Partial<Event> = {}): Event => ({
  id: "n1",
  dayId: "d1",
  eventKey: "nap_2",
  type: "nap",
  kind: "block",
  label: "Nap 2",
  startTime: "09:45",
  endTime: "10:30",
  source: "projected",
  status: "projected",
  ...overrides,
});

describe("NextNapPreview", () => {
  it("renders the nap time range and label", () => {
    renderWithAuth(<NextNapPreview nap={nap()} />);
    expect(screen.getByText(/next nap/i)).toBeVisible();
    expect(screen.getByText("9:45–10:30 AM")).toBeVisible();
    expect(screen.getByText(/Nap 2/)).toBeVisible();
  });

  it("includes owner in subtitle when set", () => {
    renderWithAuth(<NextNapPreview nap={nap({ owner: "Jake" })} />);
    expect(screen.getByText(/Nap 2 · Jake/)).toBeVisible();
  });

  it("renders calm empty state when no nap scheduled", () => {
    renderWithAuth(<NextNapPreview nap={undefined} />);
    expect(screen.getByText(/no more naps today|nothing scheduled/i)).toBeVisible();
  });

  it("shows bedtime in place of empty state when bedtime is provided", () => {
    renderWithAuth(<NextNapPreview nap={undefined} bedtime="19:00" />);
    expect(screen.getByText("Bedtime at 7:00 PM")).toBeVisible();
    expect(screen.queryByText(/no more naps today/i)).toBeNull();
  });

  it("only shows start time when endTime is missing (in-progress)", () => {
    const { endTime: _omit, ...inProgress } = nap();
    renderWithAuth(<NextNapPreview nap={inProgress} />);
    expect(screen.getByText("9:45 AM")).toBeVisible();
  });

  it("shows last-nap subtext with duration when endTime is set", () => {
    const last = nap({
      id: "nap-1",
      eventKey: "nap_1",
      label: "Nap 1",
      startTime: "08:30",
      endTime: "09:35",
      source: "actual",
      status: "completed",
    });
    renderWithAuth(<NextNapPreview nap={nap()} lastNap={last} />);
    expect(screen.getByText("Last: 8:30–9:35 AM · 1h 5m")).toBeVisible();
  });

  it("shows last-nap subtext as in-progress when endTime missing", () => {
    const { endTime: _omit, ...inProgress } = nap({
      id: "nap-1",
      eventKey: "nap_1",
      startTime: "13:10",
      source: "actual",
      status: "actual",
    });
    renderWithAuth(<NextNapPreview nap={undefined} lastNap={inProgress} />);
    expect(screen.getByText("Last: started 1:10 PM · in progress")).toBeVisible();
  });
});
