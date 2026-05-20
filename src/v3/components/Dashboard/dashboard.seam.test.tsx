/**
 * §F32 seam integration test — real projectDay across all four dashboard surfaces.
 *
 * Motivation: two CTA-driven bugs shipped through the unit suite in PRs #166
 * and #168 because unit tests pass per-layer while join bugs live at the
 * composites. Per workspace memory feedback_seam_coverage_required.md, any
 * action-chain feature needs at least one test exercising the REAL engine +
 * REAL selectors + rendered output.
 *
 * F32 is read-heavy but introduces composite logic at the joins:
 *   - nextDashboardEvent skip for in-progress naps
 *   - NowBanner priority (in-progress nap > wake window)
 *   - panel totals (bottleTotals / napTotals over actuals)
 *   - in-progress-sleep handling
 *
 * Both tests use REAL projectDay with REAL settings; no engine mocking.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Event, OwnersConfig, TimeMin } from "@/v3/schemas";
import { NO_OWNER } from "@/v3/schemas";
import { aDay, aSettings } from "@/v3/__tests__/factories";
import { projectDay } from "@/v3/engine/projectDay";
import { isInProgress } from "@/v3/lib/effectiveEnd";
import { currentWakeWindow, projectedBedtime, nextBottle, nextNap } from "@/v3/selectors";
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
  bottleChain: { bottlesPerDay: 6, bufferAfterWakeMinutes: 10 },
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
  // In-progress nap: lifecycle "recorded" with placeholder endTime
  // (start + defaultNapLengthMinutes). isInProgress() detects this
  // via the time window, not the lifecycle state.
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
    const inProgressNap = actuals.find(
      (e) => e.type === "nap" && isInProgress(e, settings, now),
    );
    const cww = currentWakeWindow(projected, now);
    const bedtime = projectedBedtime(projected);
    const nb = nextBottle(projected, now);
    const nn = nextNap(projected, now);

    // -- Render all four surfaces together --
    render(
      <>
        <NowBanner
          {...(cww !== undefined ? { wakeWindow: cww } : {})}
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
        <NextBottlePanel nextBottle={nb} actuals={actuals} nowMinutes={now} owners={owners} />
        <NextSleepPanel
          nextNap={nn}
          bedtime={bedtime}
          actuals={actuals}
          nowMinutes={now}
          putdownLeadMinutes={settings.putdownLeadMinutes}
          owners={owners}
        />
      </>,
    );

    // NowBanner: in-progress nap wins over wake window.
    expect(screen.getByText(/nap in progress/i)).toBeVisible();

    // NextEventCard: next must NOT be the in-progress nap itself — unconditionally,
    // regardless of whether next turns out to be a nap, bottle, or bedtime.
    // A regression where nextDashboardEvent returned the in-progress nap would slip
    // past a conditional type-guard check.
    expect(next).toBeDefined();
    expect(next?.id).not.toBe(inProgressNap?.id);
    // next is the projected second nap (starts ~12:30 after the in-progress nap ends at 11:45).
    expect(next?.type === "bottle" || next?.type === "nap").toBe(true);
    expect(next?.startTime).toBeGreaterThan(11 * 60 + 45);

    // Panel totals via helpers (independent confirmation of the join).
    // The in-progress nap has an endTime so napTotals counts it.
    const bTotals = bottleTotals(actuals);
    expect(bTotals).toEqual({ count: 2, oz: 9 });

    const nTotals = napTotals(actuals);
    // napTotals counts both naps (completed: 60 min, recorded with endTime: 60 min).
    expect(nTotals).toEqual({ count: 2, totalMinutes: 120 });

    // Rendered text matches.
    expect(screen.getByText(/today: 2 bottles · 9oz/i)).toBeVisible();
    expect(screen.getByText(/today: 2 naps · 2h/i)).toBeVisible();
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
