/**
 * Bottle time-snapping — keeps a projected bottle out of naps.
 *
 * A projected bottle can't fall inside a nap (DOMAIN §2, R5.6). Given a
 * cascade-proposed time, `snapBottleTime` returns a legal time: outside every
 * nap region, snapped to putdown start when adjacent ([[putdown bottle-anchor
 * rule]]), and never shifted retroactively into the past ([[no-retroactive-shift
 * rule]], ADR-0006). Each step is exported on its own so it is directly
 * testable — the cascade in `bottles.ts` only consumes the composed entry point.
 */

import type { Event } from "../../schemas";

export type Region = { start: number; end: number };

/**
 * Merged nap regions for snap checks. No-feed region is the nap itself;
 * putdown/wind-down is render-only and not excluded. Overlapping naps are
 * merged so a snap from nap A can't land inside nap B.
 */
export function napRegions(events: Event[]): Region[] {
  const raw = events
    .filter((e) => e.type === "nap" && e.endTime !== undefined)
    .map((e) => ({ start: e.startTime, end: e.endTime! }))
    .sort((a, b) => a.start - b.start);
  const merged: Region[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/**
 * If `proposed` falls in `[nap.start - lead, nap.start + napLen/2]`, snap
 * to putdown start (`nap.start - lead`). Bedtime uses only the lead window.
 * Skipped when the snap target is ≤ nowMinutes (no retroactive shift).
 */
export function snapToPutdown(
  proposed: number,
  events: Event[],
  putdownLeadMinutes: number,
  napLengthMinutes: number,
  nowMinutes: number,
): number {
  for (const ev of events) {
    if (ev.type !== "nap" && ev.type !== "bedtime") continue;
    // Bedtime has no midpoint (half=0); nap uses actual or default duration.
    const napLen =
      ev.type !== "nap"
        ? 0
        : ev.endTime !== undefined
          ? ev.endTime - ev.startTime
          : napLengthMinutes;
    const half = Math.floor(napLen / 2);
    const lo = ev.startTime - putdownLeadMinutes;
    const hi = ev.startTime + half;
    if (proposed < lo || proposed > hi) continue;
    const snapTarget = ev.startTime - putdownLeadMinutes;
    // No retroactive snap: if putdown start is past, snapForwardToNapEnd takes over.
    if (snapTarget <= nowMinutes) continue;
    return snapTarget;
  }
  return proposed;
}

/**
 * Snaps `proposed` to the nearest nap edge when it falls strictly inside a
 * nap region. Ties favor `region.start`. Falls back to the other edge if
 * the chosen one is in the past.
 */
export function snapOutOfNap(proposed: number, regions: Region[], nowMinutes: number): number {
  const region = regions.find((r) => proposed > r.start && proposed < r.end);
  if (!region) return proposed;
  const distBefore = Math.abs(proposed - region.start);
  const distAfter = Math.abs(proposed - region.end);
  let chosen = distBefore <= distAfter ? region.start : region.end;
  if (chosen < nowMinutes) {
    // With both edges past, hold the closer choice to avoid a snap-to-pre-wake loop.
    const other = chosen === region.start ? region.end : region.start;
    if (other >= nowMinutes) chosen = other;
  }
  return chosen;
}

/**
 * When `proposed` falls in `[nap.start - lead, nap.end]` and the putdown era
 * has opened (`lo ≤ now`), snap to `nap.endTime`. Future putdowns (`lo > now`)
 * are handled by snapToPutdown; this function skips them.
 */
export function snapForwardToNapEnd(
  proposed: number,
  regions: Region[],
  putdownLead: number,
  nowMinutes: number,
): number {
  for (const r of regions) {
    const lo = r.start - putdownLead;
    if (proposed < lo || proposed > r.end) continue;
    if (r.end <= nowMinutes) continue; // block already past; auto-promote handles it
    if (lo > nowMinutes) continue; // future putdown: handled by snapToPutdown
    return r.end;
  }
  return proposed;
}

/**
 * The full snap pipeline: out-of-nap → putdown-anchor → out-of-nap → forward-to-end.
 * The second `snapOutOfNap` is deliberate — `snapToPutdown` can re-land a bottle
 * inside a nap, so we re-snap before the forward-to-end fallback. Each step carries
 * its own `nowMinutes` no-retroactive-shift guard.
 */
export function snapBottleTime(
  proposed: number,
  opts: {
    events: Event[];
    regions: Region[];
    putdownLeadMinutes: number;
    defaultNapLengthMinutes: number;
    nowMinutes: number;
  },
): number {
  const { events, regions, putdownLeadMinutes, defaultNapLengthMinutes, nowMinutes } = opts;
  const noNap = snapOutOfNap(proposed, regions, nowMinutes);
  const withPutdown = snapToPutdown(
    noNap,
    events,
    putdownLeadMinutes,
    defaultNapLengthMinutes,
    nowMinutes,
  );
  const outOfNap = snapOutOfNap(withPutdown, regions, nowMinutes);
  return snapForwardToNapEnd(outOfNap, regions, putdownLeadMinutes, nowMinutes);
}
