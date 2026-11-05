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
    expect(edit(slot, 16 * 60).realizedForecast).toBeUndefined();
  });

  it("a recorded slot doc moved later than its id time is tagged", () => {
    const doc = bottle("recorded_bottle_t795", 13 * 60 + 15);
    expect(edit(doc, 14 * 60).realizedForecast).toBe(true);
  });

  it("a tagged recorded slot doc moved back to or before its id time drops the tag", () => {
    const doc = bottle("recorded_bottle_t795", 14 * 60, { realizedForecast: true });
    expect(edit(doc, 13 * 60).realizedForecast).toBeUndefined();
    expect("realizedForecast" in edit(doc, 13 * 60)).toBe(false);
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

  // A FAB doc has no slot id; it is re-decided against the projection without it,
  // where the slot it absorbed is back (PROJECTION stands in for that here).
  function editFab(doc: Event, startTime: number, without?: Event[]): Event {
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
    expect(editFab(doc, 14 * 60 + 20, PROJECTION).realizedForecast).toBe(true);
  });

  it("a FAB bottle doc moved to 09:00 drops its tag: 10:10 is the nearer slot, after it", () => {
    const doc = bottle("bottle_abc", 14 * 60 + 5, { realizedForecast: true });
    expect("realizedForecast" in editFab(doc, 9 * 60, PROJECTION)).toBe(false);
  });

  it("an untagged past FAB bottle doc moved just after a slot realizes it", () => {
    const doc = bottle("bottle_abc", 16 * 60 + 30);
    expect(editFab(doc, 13 * 60 + 25, PROJECTION).realizedForecast).toBe(true);
  });

  it("a FAB bottle doc moved into the future drops its tag: a future FAB bottle is an extra", () => {
    const doc = bottle("bottle_abc", 14 * 60 + 5, { realizedForecast: true });
    expect("realizedForecast" in editFab(doc, 18 * 60, PROJECTION)).toBe(false);
  });

  it("without the projection minus the doc, a moved FAB bottle drops its tag", () => {
    const doc = bottle("bottle_abc", 14 * 60 + 5, { realizedForecast: true });
    expect("realizedForecast" in editFab(doc, 14 * 60 + 20)).toBe(false);
  });
});
