/**
 * Seam test: projectDay → renderProjection → selectors → decideMode.
 *
 * Verifies the contextual dashboard button (ADR-0003) lights up correctly
 * when wired through the REAL engine + render passes. Each layer runs with
 * its actual implementation — no mocks — so any wiring drift between
 * cascade output, render passes, and the dashboard's mode-selection
 * surfaces here.
 */

import { describe, expect, it } from "vitest";
import type { Event, TimeMin } from "../schemas";
import { NO_OWNER } from "../schemas";
import { projectDay } from "../engine/projectDay";
import { renderProjection } from "../ui/renderProjection";
import { nextBottle } from "../selectors";
import { decideMode } from "../components/Dashboard/decideMode";
import { aContext, aSettings } from "./factories";

const hm = (h: number, m = 0): TimeMin => h * 60 + m;

function recordedBottle(id: string, startTime: TimeMin): Event {
  return {
    id,
    dayId: "day_test",
    eventKey: id,
    type: "bottle",
    kind: "instant",
    label: id,
    startTime,
    amountOz: 6,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "completed", committedAt: startTime },
  };
}

function recordedInProgressNap(startTime: TimeMin): Event {
  return {
    id: "nap_1",
    dayId: "day_test",
    eventKey: "nap_1",
    type: "nap",
    kind: "block",
    label: "Nap 1",
    startTime,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: startTime },
  };
}

function project(now: TimeMin, actuals: Event[]): Event[] {
  const ctx = aContext({
    settings: aSettings({
      defaultBottleIntervalMinutes: 180,
      defaultBottleAmountOz: 6,
      bottleChain: { bottlesPerDay: 6, bufferAfterWakeMinutes: 30 },
      // Suppress nap projection noise for the bottle-only scenarios.
      wakeWindowsMinutes: [],
    }),
    nowMinutes: now,
    actuals,
  });
  const projected = projectDay(ctx);
  return renderProjection(projected, ctx.settings, now);
}

describe("Contextual button — seam (engine + render + decideMode)", () => {
  it("lights up Log Bottle Time when Now is within ±15min of the next projected bottle", () => {
    // 8:00 recorded bottle + 180min interval cascades next at 11:00.
    // At 10:50 (10min before), the Log Bottle window is open.
    const now = hm(10, 50);
    const events = project(now, [recordedBottle("bottle_1", hm(8))]);
    const nb = nextBottle(events, now);
    expect(nb?.startTime).toBe(hm(11));

    const mode = decideMode({
      ...(nb ? { nextProjectedBottle: nb } : {}),
      nowMinutes: now,
    });
    expect(mode.kind).toBe("log-bottle");
  });

  it("stays hidden when next projected bottle is more than 15min away", () => {
    const now = hm(9, 30);
    const events = project(now, [recordedBottle("bottle_1", hm(8))]);
    const nb = nextBottle(events, now);
    expect(nb?.startTime).toBe(hm(11));

    const mode = decideMode({
      ...(nb ? { nextProjectedBottle: nb } : {}),
      nowMinutes: now,
    });
    expect(mode.kind).toBe("hidden");
  });

  it("prefers End Nap over Log Bottle when both windows overlap", () => {
    // In-progress nap started at 10:45. Cascade bottle projected at 11:00.
    // At 10:55, both the bottle window (10:45–11:15) and the in-progress
    // nap (started at 10:45) coexist — End Nap wins per ADR-0003.
    const now = hm(10, 55);
    const inProgressNap = recordedInProgressNap(hm(10, 45));
    const events = project(now, [recordedBottle("bottle_1", hm(8)), inProgressNap]);
    const nb = nextBottle(events, now);
    expect(nb?.startTime).toBe(hm(11));

    const mode = decideMode({
      inProgressNap,
      ...(nb ? { nextProjectedBottle: nb } : {}),
      nowMinutes: now,
    });
    expect(mode.kind).toBe("end-nap");
  });
});
