/**
 * Seam integration test — real projectDay across all four dashboard surfaces.
 * Two CTA-driven bugs (PRs #166, #168) shipped through the unit suite because
 * join bugs are invisible to per-layer tests. Both tests use REAL projectDay +
 * REAL settings; no engine mocking.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { aDay, aSettings } from "@/v3/__tests__/factories";
import { projectDay } from "@/v3/engine/projectDay";
import { isInProgress } from "@/v3/lib/effectiveEnd";
import { projectedBedtime, nextBottle, nextSleep } from "@/v3/selectors";
import { nextDashboardEvent, bottleTotals, napTotals } from "./dashboardStats";
import { NowBanner } from "./NowBanner";
import { NextEventCard } from "./NextEventCard";
import { NextBottlePanel } from "./NextBottlePanel";
import { NextSleepPanel } from "./NextSleepPanel";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const owners: OwnersConfig = {
  parent1: { displayName: "Jake", color: "#0af" },
  parent2: { displayName: "Kelly", color: "#f0a" },
  other: [],
};

const day = aDay({ wakeTime: 7 * 60 });

const settings = aSettings({
  defaultWakeTime: 7 * 60,
  bedtimeThreshold: 19 * 60,
  defaultNapLengthMinutes: 60,
  wakeWindowsMinutes: [120, 150, 180],
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  bottleChain: { bufferAfterWakeMinutes: 10 },
  putdownLeadMinutes: 20,
  minBottleIntervalMinutes: 20,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bottleActual(start: TimeMin, oz: number): Event {
  return {
    id: `b-${start}`,
    dayId: day.id,
    eventKey: `bottle_${start}`,
    type: "bottle",
    kind: "instant",
    label: "Bottle",
    startTime: start,
    amountOz: oz,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "completed", committedAt: start },
  };
}

function completedNapActual(start: TimeMin, end: TimeMin): Event {
  return {
    id: `n-${start}`,
    dayId: day.id,
    eventKey: `nap_${start}`,
    type: "nap",
    kind: "block",
    label: "Nap",
    startTime: start,
    endTime: end,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "completed", committedAt: end },
  };
}

function inProgressNapActual(start: TimeMin, endPlaceholder: TimeMin): Event {
  // lifecycle "recorded" with placeholder endTime; isInProgress() detects via time window.
  return {
    id: `n-${start}-ip`,
    dayId: day.id,
    eventKey: `nap_${start}`,
    type: "nap",
    kind: "block",
    label: "Nap",
    startTime: start,
    endTime: endPlaceholder,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: start },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Dashboard seam — real projectDay + new panels", () => {
  it("mid-day with an in-progress nap: NowBanner shows in-progress, NextEventCard skips the nap, panels show real totals", () => {
    const now = (11 * 60) as TimeMin;

    // Two completed bottles: 4oz at 7:00, 5oz at 10:15.
    // Two naps: one completed 9:00–10:00, one in-progress 10:45–11:45 (placeholder).
    const actuals: Event[] = [
      bottleActual((7 * 60) as TimeMin, 4),
      completedNapActual((9 * 60) as TimeMin, (10 * 60) as TimeMin),
      bottleActual((10 * 60 + 15) as TimeMin, 5),
      inProgressNapActual((10 * 60 + 45) as TimeMin, (11 * 60 + 45) as TimeMin),
    ];

    const projected = projectDay({ day, settings, actuals, nowMinutes: now });

    // -- Selectors over projected output --
    const next = nextDashboardEvent(projected, now);
    const inProgressNap = actuals.find((e) => e.type === "nap" && isInProgress(e, settings, now));
    const bedtime = projectedBedtime(projected);
    const nb = nextBottle(projected, now);
    const ns = nextSleep(projected, now);

    // -- Render all four surfaces together --
    render(
      <>
        <NowBanner
          {...(inProgressNap !== undefined ? { inProgressNap } : {})}
          owners={owners}
          nowMinutes={now}
        />
        <NextEventCard
          event={next}
          nowMinutes={now}
          owners={owners}
          putdownLeadMinutes={settings.putdownLeadMinutes}
        />
        <NextBottlePanel nextBottle={nb} events={projected} nowMinutes={now} owners={owners} />
        <NextSleepPanel
          nextSleep={ns}
          bedtime={bedtime}
          actuals={actuals}
          nowMinutes={now}
          putdownLeadMinutes={settings.putdownLeadMinutes}
          owners={owners}
        />
      </>,
    );

    // NowBanner: an in-progress nap shows the sleep banner.
    expect(screen.getByText(/nap in progress/i)).toBeVisible();

    // NextEventCard: must NOT be the in-progress nap itself.
    expect(next).toBeDefined();
    expect(next?.id).not.toBe(inProgressNap?.id);
    // next is the projected second nap (~12:30, after the in-progress nap ends at 11:45).
    expect(next?.type === "bottle" || next?.type === "nap").toBe(true);
    expect(next?.startTime).toBeGreaterThan(11 * 60 + 45);

    // Bottle totals read the PROJECTION (ADR-0006): the two real feeds (7:00@4, 10:15@5)
    // plus the 7:00 cascade's 10:00@5 forecast, which crossed Now and was promoted to
    // recorded (the 10:15 actual is an untagged extra, so no-absorption keeps the 10:00
    // slot — BOTTLE_SPEC §3.2). 3 feeds · 14oz.
    const bTotals = bottleTotals(projected, now);
    expect(bTotals).toEqual({ count: 3, oz: 14 });

    // Nap totals still read actuals: completed 9:00–10:00 (60 min) + in-progress
    // 10:45–now (15 min) = 75 min.
    const nTotals = napTotals(actuals, now);
    expect(nTotals).toEqual({ count: 2, totalMinutes: 75 });

    // Rendered text matches.
    expect(screen.getByText(/today: 3 bottles · 14oz/i)).toBeVisible();
    expect(screen.getByText(/today: 2 naps · 1h 15m/i)).toBeVisible();
  });

  it("a forecast bottle that crossed Now counts toward the daily total (read from projection, not actuals)", () => {
    const now = (11 * 60) as TimeMin;

    // One real recorded bottle at 7:00@5. The cascade forecasts the next at 10:00@5,
    // which has crossed Now (11:00) and is promoted to recorded (ADR-0006) — never
    // persisted, so it lives only in the projection.
    const actuals: Event[] = [bottleActual((7 * 60) as TimeMin, 5)];

    const projected = projectDay({ day, settings, actuals, nowMinutes: now });
    const nb = nextBottle(projected, now);

    // The bug: totals over raw actuals miss the promoted forecast.
    expect(bottleTotals(actuals, now)).toEqual({ count: 1, oz: 5 });
    // The fix: totals over the projection count it (7:00 + promoted 10:00).
    expect(bottleTotals(projected, now)).toEqual({ count: 2, oz: 10 });

    render(<NextBottlePanel nextBottle={nb} events={projected} nowMinutes={now} owners={owners} />);
    expect(screen.getByText(/today: 2 bottles · 10oz/i)).toBeVisible();
  });

  it("past bedtime threshold with bedtime completed: NextEventCard shows the end-of-day empty copy", () => {
    const now = (22 * 60) as TimeMin;

    const actuals: Event[] = [
      bottleActual((7 * 60) as TimeMin, 4),
      completedNapActual((9 * 60) as TimeMin, (10 * 60) as TimeMin),
      completedNapActual((13 * 60) as TimeMin, (14 * 60 + 30) as TimeMin),
      {
        id: "bt",
        dayId: day.id,
        eventKey: "bedtime",
        type: "bedtime",
        kind: "block",
        label: "Bedtime",
        startTime: (19 * 60 + 30) as TimeMin,
        endTime: (20 * 60 + 30) as TimeMin,
        hasPutdown: false,
        owner: NO_OWNER,
        lifecycle: { state: "completed", committedAt: (20 * 60 + 30) as TimeMin },
      },
    ];

    const projected = projectDay({ day, settings, actuals, nowMinutes: now });
    const next = nextDashboardEvent(projected, now);

    render(
      <NextEventCard
        event={next}
        nowMinutes={now}
        owners={owners}
        putdownLeadMinutes={settings.putdownLeadMinutes}
      />,
    );

    expect(screen.getByText(/no more events — have a good night/i)).toBeVisible();
  });
});
