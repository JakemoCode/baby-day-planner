import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig } from "@/v3/schemas";
import { NextNapPreview } from "./NextNapPreview";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [],
};

const nap = (overrides: Partial<Event> = {}): Event => ({
  id: "n1",
  dayId: "d1",
  eventKey: "nap_2",
  type: "nap",
  kind: "block",
  label: "Nap 2",
  startTime: 9 * 60 + 45,
  endTime: 10 * 60 + 30,
  hasPutdown: false,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("NextNapPreview", () => {
  it("renders the nap time range and label", () => {
    render(<NextNapPreview nap={nap()} owners={owners} />);
    expect(screen.getByText(/next nap/i)).toBeVisible();
    expect(screen.getByText("9:45–10:30 AM")).toBeVisible();
    expect(screen.getByText(/Nap 2/)).toBeVisible();
  });

  it("includes owner display name in subtitle when set", () => {
    render(<NextNapPreview nap={nap({ owner: { slot: "parent1" } })} owners={owners} />);
    expect(screen.getByText(/Nap 2 · Jake/)).toBeVisible();
  });

  it("renders empty state when no nap scheduled", () => {
    render(<NextNapPreview nap={undefined} owners={owners} />);
    expect(screen.getByText(/no more naps today/i)).toBeVisible();
  });

  it("shows bedtime in place of empty state when bedtime event provided", () => {
    const bedtime: Event = {
      id: "bt",
      dayId: "d1",
      eventKey: "bedtime",
      type: "bedtime",
      kind: "block",
      label: "Bedtime",
      startTime: 19 * 60,
      endTime: 7 * 60 + 24 * 60,
      hasPutdown: false,
      lifecycle: { state: "projected" },
    };
    render(<NextNapPreview nap={undefined} owners={owners} bedtime={bedtime} />);
    expect(screen.getByText("Bedtime at 7:00 PM")).toBeVisible();
    expect(screen.queryByText(/no more naps today/i)).toBeNull();
  });

  it("only shows start time when endTime is missing (in-progress)", () => {
    const { endTime: _omit, ...inProgress } = nap();
    render(<NextNapPreview nap={inProgress as Event} owners={owners} />);
    expect(screen.getByText("9:45 AM")).toBeVisible();
  });

  it("shows last-nap subtext with duration when endTime is set", () => {
    const last = nap({
      id: "nap-1",
      eventKey: "nap_1",
      label: "Nap 1",
      startTime: 8 * 60 + 30,
      endTime: 9 * 60 + 35,
      lifecycle: { state: "completed", committedAt: 9 * 60 + 35 },
    });
    render(<NextNapPreview nap={nap()} owners={owners} lastNap={last} />);
    expect(screen.getByText(/Last: 8:30–9:35 AM · 1h 5m/)).toBeVisible();
  });
});
