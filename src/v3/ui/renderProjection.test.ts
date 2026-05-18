/**
 * renderProjection: the composed render-layer pipeline.
 *
 * Tests both render passes (dream-feed label + putdown expansion) run
 * end-to-end through one entry point, in the documented order.
 */

import { describe, expect, it } from "vitest";
import type { Event, Settings } from "../schemas";
import { NO_OWNER } from "../schemas";
import { aSettings } from "../__tests__/factories";
import { renderProjection } from "./renderProjection";
import { PUTDOWN_KIND_TAG } from "../components/Timeline/expandPutdown";

const baseSettings: Settings = aSettings({
  childId: "aden",
  defaultWakeTime: 7 * 60,
  bedtimeThreshold: 19 * 60,
  putdownLeadMinutes: 15,
  dreamFeedEnabled: true,
});

const projectedBottle = (overrides: Partial<Event>): Event => ({
  id: "b-1",
  dayId: "day-1",
  eventKey: "bottle_1",
  type: "bottle",
  kind: "instant",
  startTime: 8 * 60,
  label: "Bottle 1",
  amountOz: 5,
  hasPutdown: false,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

const projectedNap = (overrides: Partial<Event>): Event => ({
  id: "n-1",
  dayId: "day-1",
  eventKey: "nap_1",
  type: "nap",
  kind: "block",
  startTime: 10 * 60,
  endTime: 11 * 60,
  label: "Nap 1",
  hasPutdown: true,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

const projectedBedtime = (overrides: Partial<Event>): Event => ({
  id: "bt-1",
  dayId: "day-1",
  eventKey: "bedtime",
  type: "bedtime",
  kind: "block",
  startTime: 19 * 60 + 30,
  endTime: 7 * 60 + 24 * 60,
  label: "Bedtime",
  hasPutdown: true,
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("renderProjection — composed render-layer pipeline", () => {
  it("applies dream-feed label to first bottle past bedtime when enabled", () => {
    const events: Event[] = [
      projectedBottle({ id: "b-1", startTime: 8 * 60 }),
      projectedBedtime({}),
      projectedBottle({ id: "b-2", eventKey: "bottle_2", startTime: 21 * 60, label: "Bottle 2" }),
    ];
    const out = renderProjection(events, baseSettings);
    const postBedtimeBottle = out.find((e) => e.id === "b-2");
    expect(postBedtimeBottle?.label).toBe("Dream Feed");
  });

  it("expands putdown blocks for projected naps with hasPutdown=true", () => {
    const out = renderProjection([projectedNap({})], baseSettings);
    const putdown = out.find((e) => e.eventKey === PUTDOWN_KIND_TAG);
    expect(putdown).toBeTruthy();
    expect(putdown?.startTime).toBe(10 * 60 - 15); // nap.start - putdownLeadMinutes
  });

  it("runs both passes together: dream-feed label + putdown chip in one call", () => {
    const events: Event[] = [
      projectedNap({}),
      projectedBedtime({}),
      projectedBottle({ id: "b-2", eventKey: "bottle_2", startTime: 21 * 60, label: "Bottle 2" }),
    ];
    const out = renderProjection(events, baseSettings);
    // Dream-feed label applied
    expect(out.find((e) => e.id === "b-2")?.label).toBe("Dream Feed");
    // Putdown chip synthesized for the nap
    expect(out.some((e) => e.eventKey === PUTDOWN_KIND_TAG)).toBe(true);
  });

  it("respects nowMinutes when provided (putdown expansion gates by time)", () => {
    // nowMinutes past the putdown window should suppress the synthetic chip
    // (R6.7 — render-time guard).
    const now = 10 * 60; // already at nap.start
    const out = renderProjection([projectedNap({})], baseSettings, now);
    const putdown = out.find((e) => e.eventKey === PUTDOWN_KIND_TAG);
    expect(putdown).toBeFalsy();
  });
});
