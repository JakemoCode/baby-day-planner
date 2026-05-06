import { describe, it, expect } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen } from "@/test-utils";
import { NextNapPreview } from "./NextNapPreview";

const nap = (overrides: Partial<Event> = {}): Event => ({
  id: "n1",
  dayId: "d1",
  eventKey: "nap_2",
  type: "nap",
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
    expect(screen.getByText(/next nap/i)).toBeInTheDocument();
    expect(screen.getByText("9:45–10:30 AM")).toBeInTheDocument();
    expect(screen.getByText(/Nap 2/)).toBeInTheDocument();
  });

  it("includes owner in subtitle when set", () => {
    renderWithAuth(<NextNapPreview nap={nap({ owner: "Jake" })} />);
    expect(screen.getByText(/Nap 2 · Jake/)).toBeInTheDocument();
  });

  it("renders calm empty state when no nap scheduled", () => {
    renderWithAuth(<NextNapPreview nap={undefined} />);
    expect(screen.getByText(/no more naps today|nothing scheduled/i)).toBeInTheDocument();
  });

  it("only shows start time when endTime is missing (in-progress)", () => {
    const { endTime: _omit, ...inProgress } = nap();
    renderWithAuth(<NextNapPreview nap={inProgress} />);
    expect(screen.getByText("9:45 AM")).toBeInTheDocument();
  });
});
