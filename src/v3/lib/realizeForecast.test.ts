import { describe, expect, it } from "vitest";
import { withRealizeTag } from "./realizeForecast";
import type { Event } from "../schemas";
import { NO_OWNER } from "../schemas";

const NOW = 15 * 60 + 30;
const INTERVAL = 180;

function bottle(id: string, startTime: number, extra: Partial<Event> = {}): Event {
  return {
    id,
    dayId: "day_test",
    eventKey: "bottle_1",
    type: "bottle",
    kind: "instant",
    label: "Bottle 1",
    startTime,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: startTime },
    ...extra,
  };
}

// Wake 7:00, nothing logged, now 15:30: forecast slots 7:10, 10:10, 13:15 (past), 16:15.
const PROJECTION = [
  bottle("proj_bottle_t430", 7 * 60 + 10),
  bottle("proj_bottle_t610", 10 * 60 + 10),
  bottle("proj_bottle_t795", 13 * 60 + 15),
  bottle("proj_bottle_t975", 16 * 60 + 15, { lifecycle: { state: "projected" } }),
];

function create(startTime: number, projection: Event[] = PROJECTION): Event {
  const saved = bottle("bottle_new", startTime, {
    lifecycle: { state: "completed", committedAt: NOW },
  });
  return withRealizeTag({
    mode: "create",
    source: bottle("bottle_new", NOW, { lifecycle: { state: "projected" } }),
    saved,
    projection,
    nowMinutes: NOW,
    intervalMinutes: INTERVAL,
  });
}

function edit(source: Event, startTime: number): Event {
  return withRealizeTag({
    mode: "edit",
    source,
    saved: { ...source, startTime },
    projection: PROJECTION,
    nowMinutes: NOW,
    intervalMinutes: INTERVAL,
  });
}

describe("R5.14 withRealizeTag: a bottle logged after the fact", () => {
  it("50 min after a past slot realizes it", () => {
    expect(create(14 * 60 + 5).realizedForecast).toBe(true);
  });

  it("5 min after a past slot realizes it", () => {
    expect(create(13 * 60 + 20).realizedForecast).toBe(true);
  });

  it("just before a slot is not tagged: the re-seed takes the later slot, a tag would eat 10:10", () => {
    expect(create(13 * 60 + 5).realizedForecast).toBeUndefined();
  });

  it("exactly on a slot is not tagged: the re-seed takes it", () => {
    expect(create(13 * 60 + 15).realizedForecast).toBeUndefined();
  });

  it("a future-time bottle stays an extra", () => {
    expect(create(16 * 60 + 30).realizedForecast).toBeUndefined();
  });

  it("is not tagged when a logged bottle sits between it and the slot", () => {
    const projection = [...PROJECTION, bottle("bottle_real", 13 * 60 + 40)];
    expect(create(14 * 60 + 5, projection).realizedForecast).toBeUndefined();
  });

  it("is not tagged when the slot before is more than one interval away", () => {
    const sparse = [bottle("proj_bottle_t430", 7 * 60 + 10)];
    expect(create(10 * 60 + 20, sparse).realizedForecast).toBeUndefined();
  });

  it("leaves non-bottles alone", () => {
    const nap = { ...bottle("nap_new", 14 * 60 + 5), type: "nap" as const };
    const out = withRealizeTag({
      mode: "create",
      source: nap,
      saved: nap,
      projection: PROJECTION,
      nowMinutes: NOW,
      intervalMinutes: INTERVAL,
    });
    expect(out.realizedForecast).toBeUndefined();
  });
});

describe("R5.14 withRealizeTag: moving a slot", () => {
  it("a projected bottle moved later realizes its slot", () => {
    const slot = bottle("proj_bottle_t975", 16 * 60 + 15, { lifecycle: { state: "projected" } });
    expect(edit(slot, 16 * 60 + 30).realizedForecast).toBe(true);
  });

  it("a projected bottle moved earlier is not tagged (a tag would absorb 13:15 too)", () => {
    const slot = bottle("proj_bottle_t975", 16 * 60 + 15, { lifecycle: { state: "projected" } });
    expect(edit(slot, 16 * 60).realizedForecast).toBe(false);
  });

  it("an amount-only edit of a recorded slot doc keeps its tag", () => {
    const doc = bottle("recorded_bottle_t795", 14 * 60, { realizedForecast: true });
    const out = withRealizeTag({
      mode: "edit",
      source: doc,
      saved: { ...doc, amountOz: 5 },
      projection: PROJECTION,
      nowMinutes: NOW,
      intervalMinutes: INTERVAL,
    });
    expect(out.realizedForecast).toBe(true);
  });

  // A recorded doc is re-decided against the projection without it, where the slot it
  // stood in for is back (PROJECTION stands in for that here).
  function editRecorded(doc: Event, startTime: number, without?: Event[]): Event {
    return withRealizeTag({
      mode: "edit",
      source: doc,
      saved: { ...doc, startTime },
      projection: PROJECTION.filter((e) => e.startTime !== 13 * 60 + 15),
      ...(without ? { projectionWithoutSource: without } : {}),
      nowMinutes: NOW,
      intervalMinutes: INTERVAL,
    });
  }

  it("a FAB bottle doc moved a little within the past still realizes the slot it absorbed", () => {
    const doc = bottle("bottle_abc", 14 * 60 + 5, { realizedForecast: true });
    expect(editRecorded(doc, 14 * 60 + 20, PROJECTION).realizedForecast).toBe(true);
  });

  it("a FAB bottle doc moved to 09:00 drops its tag: 10:10 is the nearer slot, after it", () => {
    const doc = bottle("bottle_abc", 14 * 60 + 5, { realizedForecast: true });
    expect(editRecorded(doc, 9 * 60, PROJECTION).realizedForecast).toBe(false);
  });

  it("an untagged past FAB bottle doc moved just after a slot realizes it", () => {
    const doc = bottle("bottle_abc", 16 * 60 + 30);
    expect(editRecorded(doc, 13 * 60 + 25, PROJECTION).realizedForecast).toBe(true);
  });

  it("a FAB bottle doc moved into the future drops its tag: a future FAB bottle is an extra", () => {
    const doc = bottle("bottle_abc", 14 * 60 + 5, { realizedForecast: true });
    expect(editRecorded(doc, 18 * 60, PROJECTION).realizedForecast).toBe(false);
  });

  it("a realized forecast doc moved later than its slot stays tagged", () => {
    const doc = bottle("recorded_bottle_t795", 13 * 60 + 15);
    expect(editRecorded(doc, 14 * 60, PROJECTION).realizedForecast).toBe(true);
  });

  it("a realized forecast doc moved to just before the next slot drops its tag", () => {
    const doc = bottle("recorded_bottle_t845", 14 * 60 + 5, { realizedForecast: true });
    expect(editRecorded(doc, 13 * 60, PROJECTION).realizedForecast).toBe(false);
  });

  it("a realized forecast doc moved later, past now, stays tagged", () => {
    const doc = bottle("recorded_bottle_t990", 16 * 60 + 30, { realizedForecast: true });
    expect(editRecorded(doc, 16 * 60 + 40, PROJECTION).realizedForecast).toBe(true);
  });

  // Its id names the time it was first saved (16:00), not the 16:15 slot it took.
  it("a forecast first saved at 16:00, moved to 16:10, is untagged: 16:15 is nearer", () => {
    const doc = bottle("recorded_bottle_t960", 16 * 60);
    expect(editRecorded(doc, 16 * 60 + 10, PROJECTION).realizedForecast).toBe(false);
  });

  it("without the projection minus the doc, a moved FAB bottle drops its tag", () => {
    const doc = bottle("bottle_abc", 14 * 60 + 5, { realizedForecast: true });
    expect(editRecorded(doc, 14 * 60 + 20).realizedForecast).toBe(false);
  });
});

function nap(id: string, eventKey: string, startTime: number, extra: Partial<Event> = {}): Event {
  return {
    id,
    dayId: "day_test",
    eventKey,
    type: "nap",
    kind: "block",
    label: `Nap ${eventKey.replace("nap_", "")}`,
    startTime,
    endTime: startTime + 60,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "projected" },
    ...extra,
  };
}

// Nap 2 was deleted today (not in the projection); nap_1 is recorded, nap_3 is still a forecast.
const NAP_PROJECTION = [
  nap("recorded_nap_1", "nap_1", 9 * 60, {
    lifecycle: { state: "completed", committedAt: 10 * 60 },
  }),
  nap("proj_nap_3", "nap_3", 16 * 60 + 30),
];

function createNap(startTime: number, projection: Event[] = NAP_PROJECTION): Event {
  const template = nap("nap_7f3a", "nap_4", NOW);
  return withRealizeTag({
    mode: "create",
    source: template,
    saved: { ...template, startTime, endTime: startTime + 45 },
    projection,
    nowMinutes: NOW,
    intervalMinutes: INTERVAL,
  });
}

describe("R3.12 withRealizeTag: a nap logged from the FAB", () => {
  it("records into the first projected slot that ends after its start, with its key, label and recorded id", () => {
    const out = createNap(15 * 60);
    expect([out.eventKey, out.label, out.id]).toEqual(["nap_3", "Nap 3", "recorded_nap_3"]);
    expect([out.startTime, out.endTime]).toEqual([15 * 60, 15 * 60 + 45]);
  });

  it("at a future time takes the first open slot too, so a nap set ahead cannot sort before a lower slot", () => {
    const out = createNap(16 * 60);
    expect([out.eventKey, out.id]).toEqual(["nap_3", "recorded_nap_3"]);
  });

  it("set to start inside a projected slot is that slot, not the one after it", () => {
    const out = createNap(16 * 60 + 45);
    expect([out.eventKey, out.id]).toEqual(["nap_3", "recorded_nap_3"]);
  });

  it("set to start exactly when a projected slot ends takes the slot after it", () => {
    const out = createNap(17 * 60 + 30, [...NAP_PROJECTION, nap("proj_nap_4", "nap_4", 19 * 60)]);
    expect(out.eventKey).toBe("nap_4");
  });

  it("with no projected nap left stays the new slot", () => {
    const out = createNap(15 * 60, [NAP_PROJECTION[0]!]);
    expect([out.eventKey, out.id]).toEqual(["nap_4", "nap_7f3a"]);
  });

  it("never takes a recorded nap's slot", () => {
    const out = createNap(9 * 60 + 20);
    expect(out.eventKey).toBe("nap_3");
  });

  it("later than every projected slot keeps the new slot, so slot order follows the clock", () => {
    const earlierSlots = NAP_PROJECTION.map((e) =>
      e.eventKey === "nap_3" ? { ...e, startTime: 14 * 60, endTime: 15 * 60 } : e,
    );
    const out = createNap(NOW, earlierSlots);
    expect([out.eventKey, out.id]).toEqual(["nap_4", "nap_7f3a"]);
  });

  it("earlier than two projected slots takes the first of them, not the closer later one", () => {
    const out = createNap(11 * 60, [...NAP_PROJECTION, nap("proj_nap_2", "nap_2", 12 * 60 + 30)]);
    expect(out.eventKey).toBe("nap_2");
  });
});
