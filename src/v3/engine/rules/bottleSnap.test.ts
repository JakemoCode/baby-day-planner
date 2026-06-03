import { describe, expect, it } from "vitest";
import type { Event } from "../../schemas";
import { NO_OWNER } from "../../schemas";
import {
  napRegions,
  snapBottleTime,
  snapForwardToNapEnd,
  snapOutOfNap,
  snapToPutdown,
  type Region,
} from "./bottleSnap";

const H = (h: number, m = 0) => h * 60 + m;
const PAST = H(0);

function nap(start: number, end: number): Event {
  return {
    id: `nap_t${start}`,
    dayId: "d",
    eventKey: "nap_1",
    type: "nap",
    kind: "block",
    label: "Nap",
    startTime: start,
    endTime: end,
    hasPutdown: false,
    owner: NO_OWNER,
    lifecycle: { state: "projected" },
  };
}

describe("napRegions", () => {
  it("merges overlapping/adjacent naps into one region", () => {
    const regions = napRegions([nap(H(9), H(10)), nap(H(9, 45), H(11))]);
    expect(regions).toEqual([{ start: H(9), end: H(11) }]);
  });

  it("ignores naps without an endTime (can't bound a region)", () => {
    const open = { ...nap(H(9), H(10)) };
    delete (open as { endTime?: number }).endTime;
    expect(napRegions([open])).toEqual([]);
  });
});

describe("snapOutOfNap", () => {
  const regions: Region[] = [{ start: H(9), end: H(10) }];

  it("leaves a time outside every region untouched", () => {
    expect(snapOutOfNap(H(8), regions, PAST)).toBe(H(8));
  });

  it("snaps to the nearer edge; ties favor the start edge", () => {
    expect(snapOutOfNap(H(9, 40), regions, PAST)).toBe(H(10)); // closer to end
    expect(snapOutOfNap(H(9, 30), regions, PAST)).toBe(H(9)); // tie → start
  });

  it("falls back to the far edge when the nearer one is already past", () => {
    // proposed 9:10 is nearer the 9:00 start, but now=9:20 makes that retroactive.
    expect(snapOutOfNap(H(9, 10), regions, H(9, 20))).toBe(H(10));
  });
});

describe("snapToPutdown", () => {
  it("snaps a time in the putdown window to putdown start (nap.start - lead)", () => {
    // nap 9:00–10:00, lead 15 → window [8:45, 9:30]; 9:10 snaps to 8:45.
    expect(snapToPutdown(H(9, 10), [nap(H(9), H(10))], 15, 60, PAST)).toBe(H(8, 45));
  });

  it("skips the snap when putdown start is already past (no retroactive shift)", () => {
    // same window, but now=9:00 makes the 8:45 target retroactive → unchanged.
    expect(snapToPutdown(H(9, 10), [nap(H(9), H(10))], 15, 60, H(9))).toBe(H(9, 10));
  });

  it("uses only the lead window for bedtime (no midpoint)", () => {
    const bedtime: Event = { ...nap(H(19), H(20)), type: "bedtime", eventKey: "bedtime" };
    // window is [18:45, 19:00]; 19:30 is past it → unchanged.
    expect(snapToPutdown(H(19, 30), [bedtime], 15, 60, PAST)).toBe(H(19, 30));
    expect(snapToPutdown(H(18, 50), [bedtime], 15, 60, PAST)).toBe(H(18, 45));
  });
});

describe("snapForwardToNapEnd", () => {
  const regions: Region[] = [{ start: H(9), end: H(10) }];

  it("snaps to nap end once the putdown era has opened (lo ≤ now ≤ end)", () => {
    expect(snapForwardToNapEnd(H(9, 20), regions, 15, H(9, 10))).toBe(H(10));
  });

  it("skips a future putdown (lo > now) — snapToPutdown owns that", () => {
    expect(snapForwardToNapEnd(H(9, 20), regions, 15, H(8))).toBe(H(9, 20));
  });

  it("skips a block already fully in the past", () => {
    expect(snapForwardToNapEnd(H(9, 20), regions, 15, H(11))).toBe(H(9, 20));
  });
});

describe("snapBottleTime — composition invariant", () => {
  const opts = (events: Event[], nowMinutes: number) => ({
    events,
    regions: napRegions(events),
    putdownLeadMinutes: 15,
    defaultNapLengthMinutes: 60,
    nowMinutes,
  });

  it("never returns a time strictly inside any nap region", () => {
    const events = [nap(H(9), H(10)), nap(H(13), H(14))];
    for (let t = H(8); t <= H(15); t += 5) {
      const snapped = snapBottleTime(t, opts(events, PAST));
      const inside = napRegions(events).some((r) => snapped > r.start && snapped < r.end);
      expect(inside).toBe(false);
    }
  });

  it("re-snaps out when a putdown-anchor would land inside an earlier nap", () => {
    // Nap B 8:00–9:20 sits just before nap A 9:30–10:30. With lead 15, A's putdown
    // start is 9:15 — INSIDE B. A naive single-pass snap-to-putdown would leave the
    // bottle at 9:15 (inside B); the second snapOutOfNap pulls it to B's edge.
    const events = [nap(H(8), H(9, 20)), nap(H(9, 30), H(10, 30))];
    const snapped = snapBottleTime(H(9, 25), opts(events, PAST));
    expect(snapped).toBe(H(9, 20)); // B's end edge, not the 9:15 putdown inside B
  });
});
