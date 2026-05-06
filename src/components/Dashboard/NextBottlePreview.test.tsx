import { describe, it, expect } from "vitest";
import type { Event } from "@/domain";
import { renderWithAuth, screen } from "@/test-utils";
import { NextBottlePreview } from "./NextBottlePreview";

const bottle = (overrides: Partial<Event> = {}): Event => ({
  id: "b2",
  dayId: "d1",
  eventKey: "bottle_2",
  type: "bottle",
  label: "Bottle 2",
  startTime: "11:05",
  amountOz: 5,
  source: "projected",
  status: "projected",
  ...overrides,
});

describe("NextBottlePreview", () => {
  it("renders next bottle time and the label", () => {
    renderWithAuth(<NextBottlePreview bottle={bottle()} />);
    expect(screen.getByText(/next bottle/i)).toBeVisible();
    expect(screen.getByText("11:05 AM")).toBeVisible();
  });

  it("shows projection subtitle for projected bottles", () => {
    renderWithAuth(<NextBottlePreview bottle={bottle({ source: "projected", amountOz: 5 })} />);
    expect(screen.getByText(/projected.*5 oz Bottle 2/i)).toBeVisible();
  });

  it("shows actual subtitle for actual bottles", () => {
    renderWithAuth(<NextBottlePreview bottle={bottle({ source: "actual" })} />);
    expect(screen.getByText(/logged|actual/i)).toBeVisible();
  });

  it("renders calm empty state when no bottle scheduled", () => {
    renderWithAuth(<NextBottlePreview bottle={undefined} bottle1Pending />);
    expect(screen.getByText(/start first bottle for schedule/i)).toBeVisible();
  });

  it("renders neutral empty state when bottle1Pending is false and no bottle is set", () => {
    renderWithAuth(<NextBottlePreview bottle={undefined} bottle1Pending={false} />);
    expect(screen.getByText(/no more bottles today/i)).toBeVisible();
  });

  it("drops trailing zero on whole-number oz", () => {
    renderWithAuth(<NextBottlePreview bottle={bottle({ amountOz: 5 })} />);
    expect(screen.getByText(/5 oz Bottle 2/)).toBeVisible();
    expect(screen.queryByText(/5\.0/)).toBeNull();
  });

  it("preserves fractional oz", () => {
    renderWithAuth(<NextBottlePreview bottle={bottle({ amountOz: 5.5 })} />);
    expect(screen.getByText(/5.5 oz Bottle 2/)).toBeVisible();
  });
});
