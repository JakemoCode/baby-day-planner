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
import { nearestBottleInWindow } from "../selectors";
import { decideMode, LOG_BOTTLE_WINDOW_MIN } from "../components/Dashboard/decideMode";
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
  it("lights up Log bottle now when Now is within ±15min of the next projected bottle", () => {
    // 8:00 recorded bottle + 180min interval cascades next at 11:00.
    // At 10:50 (10min before), the Log Bottle window is open.
    const now = hm(10, 50);
    const events = project(now, [recordedBottle("bottle_1", hm(8))]);
    const nb = nearestBottleInWindow(events, now, LOG_BOTTLE_WINDOW_MIN);
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
    // 90min gap to the projected 11:00 bottle — selector returns undefined.
    const nb = nearestBottleInWindow(events, now, LOG_BOTTLE_WINDOW_MIN);
    expect(nb).toBeUndefined();

    const mode = decideMode({
      ...(nb ? { nextProjectedBottle: nb } : {}),
      nowMinutes: now,
    });
    expect(mode.kind).toBe("hidden");
  });

  it("still lights up Log bottle now +10min after a projected bottle has passed", () => {
    // Engine projects bottle at 11:00. At 11:10 (after Now-cross + engine
    // auto-promote), Jake still wants the button visible so he can tap to
    // confirm an actual log at 11:10 — overwriting the auto-promoted slot.
    const now = hm(11, 10);
    const events = project(now, [recordedBottle("bottle_1", hm(8))]);
    const nb = nearestBottleInWindow(events, now, LOG_BOTTLE_WINDOW_MIN);
    expect(nb?.startTime).toBe(hm(11));

    const mode = decideMode({
      ...(nb ? { nextProjectedBottle: nb } : {}),
      nowMinutes: now,
    });
    expect(mode.kind).toBe("log-bottle");
  });

  it("prefers End Nap over Log Bottle when both windows overlap", () => {
    // In-progress nap started at 10:45. Cascade bottle projected at 11:00.
    // At 10:55, both the bottle window (10:45–11:15) and the in-progress
    // nap (started at 10:45) coexist — End Nap wins per ADR-0003.
    const now = hm(10, 55);
    const events = project(now, [
      recordedBottle("bottle_1", hm(8)),
      recordedInProgressNap(hm(10, 45)),
    ]);
    // §F66 audit fix: derive inProgressNap from the engine OUTPUT, not the
    // fixture. Otherwise the engine's actual handling of an in-progress
    // recorded nap (lifecycle bookkeeping, annotation passes) isn't verified
    // end-to-end — the test would pass even if the engine corrupted the nap.
    const inProgressNap = events.find(
      (e) =>
        e.type === "nap" &&
        e.lifecycle.state === "recorded" &&
        e.kind === "block" &&
        e.startTime <= now &&
        (e.endTime ?? Infinity) > now,
    );
    expect(inProgressNap).toBeDefined();
    const nb = nearestBottleInWindow(events, now, LOG_BOTTLE_WINDOW_MIN);
    expect(nb?.startTime).toBe(hm(11));

    const mode = decideMode({
      ...(inProgressNap ? { inProgressNap } : {}),
      ...(nb ? { nextProjectedBottle: nb } : {}),
      nowMinutes: now,
    });
    expect(mode.kind).toBe("end-nap");
  });

  it("§F66 audit: round-trip — clicking Log Bottle flips alreadyLogged to true", () => {
    // Action-chain seam: the most consequential §F66 transition is "user
    // taps Log Bottle Now → mode becomes 'logged' so re-taps don't silently
    // overwrite." Component tests cover the click handler with mocks; this
    // round-trip pins that the projected → completed lifecycle transition
    // is what flips decideMode's `alreadyLogged` flag.
    const now = hm(11, 0);
    const initialEvents = project(now, [recordedBottle("bottle_1", hm(8))]);
    const projectedBottle = nearestBottleInWindow(initialEvents, now, LOG_BOTTLE_WINDOW_MIN);
    expect(projectedBottle?.startTime).toBe(hm(11));
    // Engine auto-promotes the projected bottle to lifecycle.recorded
    // (Now-cross, ADR-0006), NOT completed — alreadyLogged stays false.
    const initialMode = decideMode({
      ...(projectedBottle ? { nextProjectedBottle: projectedBottle } : {}),
      nowMinutes: now,
    });
    expect(initialMode).toMatchObject({ kind: "log-bottle", alreadyLogged: false });

    // Simulate ContextualActionButton's onLogBottle: a `completed` bottle
    // overlaid at the projected slot's eventKey. Re-project + re-decide.
    const loggedBottle: Event = {
      id: "recorded_bottle_2",
      dayId: "day_test",
      eventKey: projectedBottle!.eventKey,
      type: "bottle",
      kind: "instant",
      label: projectedBottle!.label,
      startTime: now,
      amountOz: 6,
      hasPutdown: false,
      owner: NO_OWNER,
      lifecycle: { state: "completed", committedAt: now },
    };
    const afterEvents = project(now, [recordedBottle("bottle_1", hm(8)), loggedBottle]);
    const afterBottle = nearestBottleInWindow(afterEvents, now, LOG_BOTTLE_WINDOW_MIN);
    const afterMode = decideMode({
      ...(afterBottle ? { nextProjectedBottle: afterBottle } : {}),
      nowMinutes: now,
    });
    expect(afterMode).toMatchObject({ kind: "log-bottle", alreadyLogged: true });
  });

  it("§F66 fast-follow B2: with recorded Bottle 1 @ 8am and projected Bottle 2 in window, the selector targets Bottle 2 (not Bottle 1)", () => {
    // Jake's pre-merge dogfood: bottle 1 recorded @ 8am, projected
    // bottle 2 in window, Now near bottle 2. Click Log Bottle Now
    // should promote the bottle_2 slot, NOT move bottle 1 to Now.
    // Engine cascades bottle 2 at 8:00 + 180min = 11:00. Now = 10:54
    // puts bottle 2 in window (delta = 6min).
    const now = hm(10, 54);
    const events = project(now, [recordedBottle("bottle_1", hm(8))]);
    const nb = nearestBottleInWindow(events, now, LOG_BOTTLE_WINDOW_MIN);
    expect(nb?.eventKey).toBe("bottle_2");
    expect(nb?.startTime).toBe(hm(11, 0));
  });
});
