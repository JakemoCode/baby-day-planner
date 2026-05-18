import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { NextEventCard } from "./NextEventCard";

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [{ id: "daycare", displayName: "Daycare", color: "#aa0" }],
};

const ev = (overrides: Partial<Event> = {}): Event => ({
  id: "e1",
  dayId: "day-1",
  eventKey: "nap_2",
  type: "nap",
  kind: "block",
  label: "Nap 2",
  startTime: 9 * 60 + 30,
  endTime: 10 * 60 + 15,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("NextEventCard", () => {
  it("renders the next event label, time and 'in N min' delta", () => {
    render(
      <NextEventCard
        event={ev()}
        nowMinutes={9 * 60 + 18}
        owners={owners}
        putdownLeadMinutes={20}
      />,
    );
    expect(screen.getByText("Nap 2")).toBeVisible();
    expect(screen.getByText("9:30 AM")).toBeVisible();
    expect(screen.getByText(/in 12m/i)).toBeVisible();
  });

  it("shows 'now' when delta is 0", () => {
    render(
      <NextEventCard
        event={ev()}
        nowMinutes={9 * 60 + 30}
        owners={owners}
        putdownLeadMinutes={20}
      />,
    );
    expect(screen.getByText(/now/i)).toBeVisible();
  });

  it("formats delta over 60 minutes as '1h 5m'", () => {
    render(
      <NextEventCard
        event={ev({ startTime: 10 * 60 + 35 })}
        nowMinutes={9 * 60 + 30}
        owners={owners}
        putdownLeadMinutes={20}
      />,
    );
    expect(screen.getByText(/in 1h 5m/i)).toBeVisible();
  });

  it("displays owner display name from OwnersConfig when set", () => {
    render(
      <NextEventCard
        event={ev({ owner: { slot: "parent1" } })}
        nowMinutes={500}
        owners={owners}
        putdownLeadMinutes={20}
      />,
    );
    expect(screen.getByText("Jake")).toBeVisible();
  });

  it("resolves 'other' owner via OwnersConfig.other[id]", () => {
    render(
      <NextEventCard
        event={ev({ owner: { slot: "other", otherId: "daycare" } })}
        nowMinutes={500}
        owners={owners}
        putdownLeadMinutes={20}
      />,
    );
    expect(screen.getByText("Daycare")).toBeVisible();
  });

  it("renders a calm empty state when event is undefined", () => {
    render(
      <NextEventCard event={undefined} nowMinutes={500} owners={owners} putdownLeadMinutes={20} />,
    );
    expect(screen.getByText(/no more events — have a good night/i)).toBeVisible();
  });
});

describe("NextEventCard — putdown sub-line", () => {
  const napEvent = {
    id: "n1",
    dayId: "d1",
    eventKey: "nap_1",
    type: "nap" as const,
    kind: "block" as const,
    label: "Nap",
    startTime: (14 * 60 + 10) as TimeMin,
    endTime: (15 * 60 + 25) as TimeMin,
    hasPutdown: true,
    owner: NO_OWNER,
    lifecycle: { state: "projected" as const },
  };

  it("renders 'Putdown HH:MM' when next is a nap", () => {
    render(
      <NextEventCard
        event={napEvent}
        nowMinutes={(13 * 60) as TimeMin}
        owners={ownersFixture()}
        putdownLeadMinutes={20}
      />,
    );
    expect(screen.getByText(/putdown 1:50 PM/i)).toBeVisible();
  });

  it("renders 'Putdown HH:MM' when next is a bedtime", () => {
    const bedtimeEvent = {
      ...napEvent,
      type: "bedtime" as const,
      label: "Bedtime",
      eventKey: "bedtime",
    };
    render(
      <NextEventCard
        event={bedtimeEvent}
        nowMinutes={(18 * 60) as TimeMin}
        owners={ownersFixture()}
        putdownLeadMinutes={20}
      />,
    );
    expect(screen.getByText(/putdown 1:50 PM/i)).toBeVisible();
  });

  it("does NOT render putdown line when next is a bottle", () => {
    const bottleEvent = {
      ...napEvent,
      type: "bottle" as const,
      kind: "instant" as const,
      label: "Bottle",
      eventKey: "bottle_1",
    };
    render(
      <NextEventCard
        event={bottleEvent}
        nowMinutes={(13 * 60) as TimeMin}
        owners={ownersFixture()}
        putdownLeadMinutes={20}
      />,
    );
    expect(screen.queryByText(/putdown/i)).toBeNull();
  });
});

describe("NextEventCard — end-of-day empty state", () => {
  it("renders 'No more events — have a good night' when event is undefined", () => {
    render(
      <NextEventCard
        event={undefined}
        nowMinutes={(22 * 60) as TimeMin}
        owners={ownersFixture()}
        putdownLeadMinutes={20}
      />,
    );
    expect(screen.getByText(/no more events — have a good night/i)).toBeVisible();
  });
});

function ownersFixture(): OwnersConfig {
  return {
    parent1: { displayName: "Jake", color: "#0af" },
    parent2: { displayName: "Kelly", color: "#f0a" },
    other: [],
  };
}
