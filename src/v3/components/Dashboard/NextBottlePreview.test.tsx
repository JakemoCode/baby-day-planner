import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig } from "@/v3/schemas";
import { NextBottlePreview } from "./NextBottlePreview";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [],
};

const bottle = (overrides: Partial<Event> = {}): Event => ({
  id: "b2",
  dayId: "d1",
  eventKey: "bottle_2",
  type: "bottle",
  kind: "instant",
  label: "Bottle 2",
  startTime: 11 * 60 + 5,
  amountOz: 5,
  hasPutdown: false,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("NextBottlePreview", () => {
  it("renders next bottle time and the label", () => {
    render(<NextBottlePreview bottle={bottle()} bottle1Pending={false} owners={owners} />);
    expect(screen.getByText(/next bottle/i)).toBeVisible();
    expect(screen.getByText("11:05 AM")).toBeVisible();
  });

  it("shows projected subtitle for projected bottles", () => {
    render(<NextBottlePreview bottle={bottle()} bottle1Pending={false} owners={owners} />);
    expect(screen.getByText(/projected.*5 oz Bottle 2/i)).toBeVisible();
  });

  it("shows logged subtitle for recorded bottles", () => {
    render(
      <NextBottlePreview
        bottle={bottle({ lifecycle: { state: "completed", committedAt: 11 * 60 + 5 } })}
        bottle1Pending={false}
        owners={owners}
      />,
    );
    expect(screen.getByText(/logged/i)).toBeVisible();
  });

  it("renders 'start first bottle' empty state when bottle1Pending and no bottle", () => {
    render(<NextBottlePreview bottle={undefined} bottle1Pending owners={owners} />);
    expect(screen.getByText(/start first bottle for schedule/i)).toBeVisible();
  });

  it("renders 'no more bottles' when bottle1Pending=false and no bottle", () => {
    render(<NextBottlePreview bottle={undefined} bottle1Pending={false} owners={owners} />);
    expect(screen.getByText(/no more bottles today/i)).toBeVisible();
  });

  it("shows last-bottle subtext when lastBottle is provided", () => {
    const last = bottle({
      id: "b1",
      eventKey: "bottle_1",
      label: "Bottle 1",
      startTime: 13 * 60 + 45,
      amountOz: 5,
      lifecycle: { state: "completed", committedAt: 13 * 60 + 45 },
    });
    render(
      <NextBottlePreview
        bottle={bottle()}
        bottle1Pending={false}
        owners={owners}
        lastBottle={last}
      />,
    );
    expect(screen.getByText("Last: 1:45 PM · 5 oz")).toBeVisible();
  });

  // In the render-only-label model, a "dream feed" is a regular bottle
  // whose label is set to "Dream Feed" by applyDreamFeedLabel() before
  // events reach this component. So the previous "show dream feed in
  // place of empty state" / "fallback when bottle1Pending" cases dissolve:
  // a dream-feed-labeled bottle is just `bottle`, not a separate prop.

  // §F9 PORT — oz formatting contract previously asserted in V2.

  it("renders whole-number oz without a trailing zero ('5 oz', not '5.0 oz')", () => {
    render(
      <NextBottlePreview bottle={bottle({ amountOz: 5 })} bottle1Pending={false} owners={owners} />,
    );
    // \b boundary excludes "5.0 oz" — fails loudly if the formatter regresses.
    expect(screen.getByText(/projected.*\b5 oz\b/i)).toBeVisible();
  });

  it("preserves fractional oz ('4.5 oz')", () => {
    render(
      <NextBottlePreview
        bottle={bottle({ amountOz: 4.5 })}
        bottle1Pending={false}
        owners={owners}
      />,
    );
    expect(screen.getByText(/4\.5 oz/)).toBeVisible();
  });
});
