import { describe, expect, it } from "vitest";
import { decideMode } from "./decideMode";
import { NO_OWNER, type Event, type TimeMin } from "@/v3/schemas";

const hm = (h: number, m = 0): TimeMin => h * 60 + m;

function inProgressNap(opts: { startTime?: TimeMin } = {}): Event {
  return {
    id: "recorded_nap_1",
    dayId: "day-1",
    eventKey: "nap_1",
    type: "nap",
    kind: "block",
    label: "Nap 1",
    startTime: opts.startTime ?? hm(13),
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: opts.startTime ?? hm(13) },
  };
}

function inProgressBedtime(): Event {
  return {
    id: "recorded_bedtime",
    dayId: "day-1",
    eventKey: "bedtime",
    type: "bedtime",
    kind: "block",
    label: "Bedtime",
    startTime: hm(19),
    endTime: hm(30),
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "recorded", annotatedAt: hm(19) },
  };
}

function projectedBottle(startTime: TimeMin): Event {
  return {
    id: `projected_bottle_${startTime}`,
    dayId: "day-1",
    eventKey: "bottle_2",
    type: "bottle",
    kind: "instant",
    label: "Bottle 2",
    startTime,
    amountOz: 6,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "projected" },
  };
}

describe("decideMode — ADR-0003 multi-modal dashboard button", () => {
  it("returns hidden when no in-progress sleep and no bottle in window", () => {
    expect(decideMode({ nowMinutes: hm(10) })).toEqual({ kind: "hidden" });
  });

  it("returns end-nap when an in-progress nap exists", () => {
    const nap = inProgressNap();
    expect(decideMode({ inProgressNap: nap, nowMinutes: hm(13, 15) })).toEqual({
      kind: "end-nap",
      nap,
    });
  });

  it("returns end-bedtime when in-progress bedtime exists and no bottle window is open", () => {
    const bedtime = inProgressBedtime();
    // Morning, 6am, with no projected bottle nearby
    expect(decideMode({ inProgressBedtime: bedtime, nowMinutes: hm(6) })).toEqual({
      kind: "end-bedtime",
      bedtime,
    });
  });

  it("auto-sunsets end-bedtime once a projected bottle's window opens (Now ≥ start − 15)", () => {
    const bedtime = inProgressBedtime();
    const bottle = projectedBottle(hm(7, 0));
    // Now = 6:50 → bottle window [6:45, 7:15] is open. End-bedtime falls through.
    const out = decideMode({
      inProgressBedtime: bedtime,
      nextProjectedBottle: bottle,
      nowMinutes: hm(6, 50),
    });
    expect(out).toEqual({ kind: "log-bottle", projected: bottle, alreadyLogged: false });
  });

  it("returns log-bottle when bottle is within ±15min and no nap or bedtime", () => {
    const bottle = projectedBottle(hm(12, 0));
    const out = decideMode({ nextProjectedBottle: bottle, nowMinutes: hm(11, 50) });
    expect(out).toEqual({ kind: "log-bottle", projected: bottle, alreadyLogged: false });
  });

  it("end-nap wins over log-bottle when nap is in progress during bottle window", () => {
    const nap = inProgressNap();
    const bottle = projectedBottle(hm(13, 10));
    const out = decideMode({
      inProgressNap: nap,
      nextProjectedBottle: bottle,
      nowMinutes: hm(13, 0),
    });
    expect(out.kind).toBe("end-nap");
  });

  it("returns hidden when projected bottle is more than 15min away", () => {
    const bottle = projectedBottle(hm(13, 0));
    const out = decideMode({ nextProjectedBottle: bottle, nowMinutes: hm(12, 40) });
    expect(out).toEqual({ kind: "hidden" });
  });

  it("returns hidden when Now has passed bottle.startTime by more than 15min", () => {
    const bottle = projectedBottle(hm(11, 0));
    const out = decideMode({ nextProjectedBottle: bottle, nowMinutes: hm(11, 16) });
    expect(out).toEqual({ kind: "hidden" });
  });

  it("treats bottle window as inclusive at the exact ±15min boundaries", () => {
    const bottle = projectedBottle(hm(10, 0));
    expect(decideMode({ nextProjectedBottle: bottle, nowMinutes: hm(9, 45) }).kind).toBe(
      "log-bottle",
    );
    expect(decideMode({ nextProjectedBottle: bottle, nowMinutes: hm(10, 15) }).kind).toBe(
      "log-bottle",
    );
  });
});
