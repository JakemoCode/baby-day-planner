/**
 * V3 putdown is a render-only flag (R6.1). The engine never persists a
 * putdown event; instead, parent events (nap / bedtime) carry
 * `hasPutdown: true` and the renderer prepends a synthetic block.
 *
 * `expandPutdownBlocks` is the renderer-side helper that turns the flag
 * into virtual block events for layout purposes. The synthetic events
 * never leave the renderer.
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../../schemas";
import { PUTDOWN_KIND_TAG, expandPutdownBlocks } from "./expandPutdown";

const ev = (overrides: Partial<Event>): Event => ({
  id: "e",
  dayId: "d-1",
  eventKey: "x",
  type: "nap",
  kind: "block",
  startTime: 9 * 60,
  endTime: 10 * 60,
  label: "Nap 1",
  hasPutdown: false,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("expandPutdownBlocks", () => {
  it("is a no-op when no event has hasPutdown:true", () => {
    const input: Event[] = [ev({ id: "a" }), ev({ id: "b", startTime: 13 * 60 })];
    const out = expandPutdownBlocks(input, 15);
    expect(out).toEqual(input);
  });

  it("prepends a synthetic putdown block before a nap with hasPutdown", () => {
    const nap = ev({
      id: "nap-1",
      eventKey: "nap_1",
      hasPutdown: true,
      owner: { slot: "parent1" },
    });
    const out = expandPutdownBlocks([nap], 15);
    expect(out).toHaveLength(2);
    const putdown = out.find((e) => e.id === `putdown:nap-1`);
    expect(putdown).toBeDefined();
    expect(putdown?.kind).toBe("block");
    expect(putdown?.startTime).toBe(9 * 60 - 15);
    expect(putdown?.endTime).toBe(9 * 60);
    expect(putdown?.label).toBe("Putdown");
    expect(putdown?.owner).toEqual({ slot: "parent1" });
  });

  it("synthetic putdown carries a renderer tag so the timeline can detect it", () => {
    const nap = ev({ id: "nap-1", hasPutdown: true });
    const out = expandPutdownBlocks([nap], 15);
    const putdown = out.find((e) => e.id === `putdown:nap-1`);
    expect(putdown?.eventKey).toBe(PUTDOWN_KIND_TAG);
  });

  it("inherits the parent's projected/recorded lifecycle so dimming follows the parent", () => {
    const recorded = ev({
      id: "nap-1",
      hasPutdown: true,
      lifecycle: { state: "completed", committedAt: 10 * 60 },
    });
    const out = expandPutdownBlocks([recorded], 15);
    const putdown = out.find((e) => e.id === `putdown:nap-1`);
    expect(putdown?.lifecycle).toEqual({ state: "completed", committedAt: 10 * 60 });
  });

  it("supports bedtime parents too (R6 applies to any block-kind event with hasPutdown)", () => {
    const bedtime = ev({
      id: "bed",
      type: "bedtime",
      eventKey: "bedtime",
      startTime: 19 * 60,
      endTime: 31 * 60,
      label: "Bedtime",
      hasPutdown: true,
    });
    const out = expandPutdownBlocks([bedtime], 20);
    const putdown = out.find((e) => e.id === `putdown:bed`);
    expect(putdown?.startTime).toBe(19 * 60 - 20);
    expect(putdown?.endTime).toBe(19 * 60);
  });

  // Temporal gate moved from engine R6.1 to here. The engine sets
  // hasPutdown=true on every nap/bedtime; the renderer decides whether
  // the putdown window is still in the future.
  describe("R6.7 — temporal gate (suppress when parent has passed)", () => {
    it("skips the synthetic when parent.startTime <= nowMinutes", () => {
      const past = ev({ id: "nap-past", hasPutdown: true, startTime: 9 * 60 });
      const out = expandPutdownBlocks([past], 15, 10 * 60);
      expect(out.find((e) => e.id === "putdown:nap-past")).toBeUndefined();
    });

    it("emits the synthetic when parent.startTime > nowMinutes", () => {
      const future = ev({ id: "nap-future", hasPutdown: true, startTime: 14 * 60 });
      const out = expandPutdownBlocks([future], 15, 10 * 60);
      expect(out.find((e) => e.id === "putdown:nap-future")).toBeDefined();
    });

    it("emits the synthetic for every hasPutdown event when nowMinutes omitted (archived day)", () => {
      const recorded = ev({
        id: "nap-rec",
        hasPutdown: true,
        startTime: 9 * 60,
        lifecycle: { state: "completed", committedAt: 9 * 60 },
      });
      const out = expandPutdownBlocks([recorded], 15);
      expect(out.find((e) => e.id === "putdown:nap-rec")).toBeDefined();
    });

    it("overridden lifecycle still gets the synthetic when parent is future", () => {
      // The actual user bug: owner-only drawer edit on a projected nap
      // promotes lifecycle to `overridden` (time preserved). Putdown
      // must still render.
      const overridden = ev({
        id: "nap-ov",
        hasPutdown: true,
        startTime: 14 * 60,
        lifecycle: { state: "overridden", annotatedAt: 10 * 60 },
      });
      const out = expandPutdownBlocks([overridden], 15, 10 * 60);
      expect(out.find((e) => e.id === "putdown:nap-ov")).toBeDefined();
    });
  });
});
