/**
 * Seam test: projectDay → renderProjection → selectors → decideMode (ADR-0003).
 * All layers run real implementations; wiring bugs surface here.
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
    // Button stays visible +15min past the slot so the user can confirm a late log.
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
    // Derive inProgressNap from engine output, not the fixture, so lifecycle
    // bookkeeping is verified end-to-end.
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
    // Pins that projected → completed lifecycle transition is what flips alreadyLogged.
    const now = hm(11, 0);
    const initialEvents = project(now, [recordedBottle("bottle_1", hm(8))]);
    const projectedBottle = nearestBottleInWindow(initialEvents, now, LOG_BOTTLE_WINDOW_MIN);
    expect(projectedBottle?.startTime).toBe(hm(11));
    // ADR-0006 auto-promotes to recorded (not completed) — alreadyLogged stays false.
    const initialMode = decideMode({
      ...(projectedBottle ? { nextProjectedBottle: projectedBottle } : {}),
      nowMinutes: now,
    });
    expect(initialMode).toMatchObject({ kind: "log-bottle", alreadyLogged: false });

    // onLogBottle overlays a completed bottle at the projected slot's eventKey.
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
    // Selector must target bottle_2 (the cascade slot), not bottle_1 (already logged).
    const now = hm(10, 54);
    const events = project(now, [recordedBottle("bottle_1", hm(8))]);
    const nb = nearestBottleInWindow(events, now, LOG_BOTTLE_WINDOW_MIN);
    expect(nb?.eventKey).toBe("bottle_2");
    expect(nb?.startTime).toBe(hm(11, 0));
  });
});
