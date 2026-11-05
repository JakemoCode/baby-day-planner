/**
 * ENGINE_SPEC §R5.14: decides the `realizedForecast` tag on a saved bottle. A tagged
 * bottle absorbs the last forecast slot before it (bottles.ts realize branch); a slot
 * at or after it is already taken by the R5.1 re-seed, so the tag is set only when the
 * slot the bottle stands in for lies before it. Called from useDrawer, the one tagging site.
 */

import type { Event, TimeMin } from "../schemas";
import { isDreamFeed, isEngineEmittedId, recordedBottleSlotTime } from "./eventConventions";

export type RealizeTagInput = {
  mode: "create" | "edit";
  /** The drawer's source: the edited event, or the create template. */
  source: Event;
  saved: Event;
  /** The projection the drawer was opened over (forecast slots carry `proj_` ids). */
  projection: readonly Event[];
  nowMinutes: TimeMin;
  /** One forecast interval (`forecastIntervalMinutes`). */
  intervalMinutes: number;
  /**
   * Edit only: the projection without the edited doc, where any slot it absorbed is
   * back. A FAB bottle doc has no slot id, so its tag is re-decided against this.
   */
  projectionWithoutSource?: readonly Event[];
};

export function withRealizeTag(input: RealizeTagInput): Event {
  const { mode, source, saved } = input;
  if (saved.type !== "bottle" || isDreamFeed(saved)) return saved;
  if (mode === "create") {
    return loggedAfterTheFactRealizes(input) ? { ...saved, realizedForecast: true } : saved;
  }
  if (saved.startTime === source.startTime) return saved;
  const slotTime = slotTimeOf(source);
  if (slotTime === null) {
    // Without that projection, untag: a forecast slot reappears beside the feed, where
    // a stale tag could silently absorb a slot the bottle no longer stands in for.
    const without = input.projectionWithoutSource;
    return without && loggedAfterTheFactRealizes({ ...input, projection: without })
      ? { ...saved, realizedForecast: true }
      : untagged(saved);
  }
  return saved.startTime > slotTime ? { ...saved, realizedForecast: true } : untagged(saved);
}

function untagged(event: Event): Event {
  const out = { ...event };
  delete out.realizedForecast;
  return out;
}

/** The slot an edited bottle stands in for: its forecast time, or the time its recorded id names. */
function slotTimeOf(source: Event): TimeMin | null {
  return isEngineEmittedId(source.id) ? source.startTime : recordedBottleSlotTime(source.id);
}

/**
 * DOMAIN.md §2: a feed logged after the fact replaces the forecast slot nearest it.
 * Tag only when that slot is the bottle just before it, within one interval, with no
 * closer slot after it.
 */
function loggedAfterTheFactRealizes(input: RealizeTagInput): boolean {
  const { saved, projection, nowMinutes, intervalMinutes } = input;
  const t = saved.startTime;
  if (t > nowMinutes) return false;
  const others = projection.filter(
    (e) => e.type === "bottle" && !isDreamFeed(e) && e.id !== saved.id,
  );
  if (others.some((e) => e.startTime === t)) return false;
  const before = others
    .filter((e) => e.startTime < t)
    .reduce<Event | undefined>((a, e) => (a && a.startTime >= e.startTime ? a : e), undefined);
  if (!before || !isEngineEmittedId(before.id)) return false;
  const gap = t - before.startTime;
  if (gap > intervalMinutes) return false;
  const nextSlotGap = Math.min(
    ...others.filter((e) => e.startTime > t && isEngineEmittedId(e.id)).map((e) => e.startTime - t),
  );
  return gap <= nextSlotGap;
}
