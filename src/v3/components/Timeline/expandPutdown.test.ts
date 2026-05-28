/**
 * Putdown is render-only (R6.1): the engine sets `hasPutdown: true` on nap/bedtime;
 * `expandPutdownBlocks` synthesizes the virtual block for layout. Never persisted.
 */

import { describe, expect, it } from "vitest";
import type { Event } from "../../schemas";
import { NO_OWNER } from "../../schemas";
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
  owner: NO_OWNER,
  lifecycle: { state: "projected" },
  ...overrides,
});

describe("expandPutdownBlocks", () => {
  it("is a no-op when no event has hasPutdown:true", () => {
    const input: Event[] = [ev({ id: "a" }), ev({ id: "b", startTime: 13 * 60 })];
    const out = expandPutdownBlocks(input, { putdownLeadMinutes: 15, defaultNapLengthMinutes: 60 });
    expect(out).toEqual(input);
  });

  it("prepends a synthetic putdown block before a nap with hasPutdown", () => {
    const nap = ev({
      id: "nap-1",
      eventKey: "nap_1",
      hasPutdown: true,
      owner: { slot: "parent1" },
    });
    const out = expandPutdownBlocks([nap], { putdownLeadMinutes: 15, defaultNapLengthMinutes: 60 });
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
    const out = expandPutdownBlocks([nap], { putdownLeadMinutes: 15, defaultNapLengthMinutes: 60 });
    const putdown = out.find((e) => e.id === `putdown:nap-1`);
    expect(putdown?.eventKey).toBe(PUTDOWN_KIND_TAG);
  });

  it("inherits the parent's projected/recorded lifecycle so dimming follows the parent", () => {
    const recorded = ev({
      id: "nap-1",
      hasPutdown: true,
      owner: NO_OWNER,
      lifecycle: { state: "completed", committedAt: 10 * 60 },
    });
    const out = expandPutdownBlocks([recorded], {
      putdownLeadMinutes: 15,
      defaultNapLengthMinutes: 60,
    });
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
      owner: NO_OWNER,
    });
    const out = expandPutdownBlocks([bedtime], {
      putdownLeadMinutes: 20,
      defaultNapLengthMinutes: 60,
    });
    const putdown = out.find((e) => e.id === `putdown:bed`);
    expect(putdown?.startTime).toBe(19 * 60 - 20);
    expect(putdown?.endTime).toBe(19 * 60);
  });

  // Temporal gate moved from engine R6.1 to renderer; renderer decides if window is future.
  describe("R6.7 — temporal gate (suppress when parent has passed)", () => {
    it("skips the synthetic when parent.startTime <= nowMinutes", () => {
      const past = ev({ id: "nap-past", hasPutdown: true, startTime: 9 * 60 });
      const out = expandPutdownBlocks([past], {
        putdownLeadMinutes: 15,
        defaultNapLengthMinutes: 60,
        nowMinutes: 10 * 60,
      });
      expect(out.find((e) => e.id === "putdown:nap-past")).toBeUndefined();
    });

    it("emits the synthetic when parent.startTime > nowMinutes", () => {
      const future = ev({ id: "nap-future", hasPutdown: true, startTime: 14 * 60 });
      const out = expandPutdownBlocks([future], {
        putdownLeadMinutes: 15,
        defaultNapLengthMinutes: 60,
        nowMinutes: 10 * 60,
      });
      expect(out.find((e) => e.id === "putdown:nap-future")).toBeDefined();
    });

    it("emits the synthetic for every hasPutdown event when nowMinutes omitted (archived day)", () => {
      const recorded = ev({
        id: "nap-rec",
        hasPutdown: true,
        owner: NO_OWNER,
        startTime: 9 * 60,
        lifecycle: { state: "completed", committedAt: 9 * 60 },
      });
      const out = expandPutdownBlocks([recorded], {
        putdownLeadMinutes: 15,
        defaultNapLengthMinutes: 60,
      });
      expect(out.find((e) => e.id === "putdown:nap-rec")).toBeDefined();
    });

    it("overridden lifecycle still gets the synthetic when parent is future", () => {
      // owner-only drawer edit promotes lifecycle to `overridden` (time preserved); putdown must still render.
      const overridden = ev({
        id: "nap-ov",
        hasPutdown: true,
        owner: NO_OWNER,
        startTime: 14 * 60,
        lifecycle: { state: "recorded", annotatedAt: 10 * 60 },
      });
      const out = expandPutdownBlocks([overridden], {
        putdownLeadMinutes: 15,
        defaultNapLengthMinutes: 60,
        nowMinutes: 10 * 60,
      });
      expect(out.find((e) => e.id === "putdown:nap-ov")).toBeDefined();
    });
  });

  // R6.8 — suppress putdown whose window overlaps an in-progress sleep block.
  describe("R6.8 — in-progress sleep gate", () => {
    const DEFAULT_NAP_LENGTH = 60;

    it("synthesizes putdown when no in-progress sleep exists (baseline)", () => {
      // nap_2 is projected future; no started sleep in the list.
      const nap2 = ev({
        id: "nap-2",
        eventKey: "nap_2",
        startTime: 13 * 60,
        hasPutdown: true,
        owner: NO_OWNER,
        lifecycle: { state: "projected" },
      });
      const out = expandPutdownBlocks([nap2], {
        putdownLeadMinutes: 15,
        defaultNapLengthMinutes: DEFAULT_NAP_LENGTH,
        nowMinutes: 10 * 60,
      });
      expect(out.find((e) => e.id === "putdown:nap-2")).toBeDefined();
    });

    it("suppresses putdown when its window overlaps an in-progress nap with no endTime", () => {
      // nap_1 recorded at 9:00, no endTime → soft-end 10:00 (startTime + napLen).
      // nap_2 putdown window [9:30, 9:45] overlaps → suppressed.
      const startedNap1: Event = {
        id: "nap-1",
        dayId: "d-1",
        eventKey: "nap_1",
        type: "nap",
        kind: "block",
        startTime: 9 * 60,
        label: "Nap 1",
        hasPutdown: false,
        owner: NO_OWNER,
        lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
      };
      const projNap2 = ev({
        id: "nap-2",
        eventKey: "nap_2",
        startTime: 9 * 60 + 45,
        endTime: 10 * 60 + 45,
        hasPutdown: true,
        owner: NO_OWNER,
        lifecycle: { state: "projected" },
      });
      const out = expandPutdownBlocks([startedNap1, projNap2], {
        putdownLeadMinutes: 15,
        defaultNapLengthMinutes: DEFAULT_NAP_LENGTH,
        nowMinutes: 9 * 60 + 30,
      });
      expect(out.find((e) => e.id === "putdown:nap-2")).toBeUndefined();
    });

    it("synthesizes putdown when the in-progress nap's explicit endTime ends before the window", () => {
      // nap_1 endTime 9:20; nap_2 putdown window [12:45, 13:00] — no overlap → renders.
      const startedNap1 = ev({
        id: "nap-1",
        eventKey: "nap_1",
        startTime: 9 * 60,
        endTime: 9 * 60 + 20,
        hasPutdown: false,
        owner: NO_OWNER,
        lifecycle: { state: "recorded", annotatedAt: 9 * 60 },
      });
      const projNap2 = ev({
        id: "nap-2",
        eventKey: "nap_2",
        startTime: 13 * 60,
        endTime: 14 * 60,
        hasPutdown: true,
        owner: NO_OWNER,
        lifecycle: { state: "projected" },
      });
      const out = expandPutdownBlocks([startedNap1, projNap2], {
        putdownLeadMinutes: 15,
        defaultNapLengthMinutes: DEFAULT_NAP_LENGTH,
        nowMinutes: 10 * 60,
      });
      expect(out.find((e) => e.id === "putdown:nap-2")).toBeDefined();
    });
  });
});
