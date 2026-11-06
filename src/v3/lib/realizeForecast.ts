/**
 * ENGINE_SPEC §R5.14: decides the `realizedForecast` tag on a saved bottle. A tagged
 * bottle absorbs the last forecast slot before it (bottles.ts realize branch); a slot
 * at or after it is already taken by the R5.1 re-seed, so the tag is set only when the
 * slot the bottle stands in for lies before it. Called from useDrawer, the one tagging site.
 *
 * ENGINE_SPEC §R3.12: a nap logged from the FAB records into the first projected nap
 * slot still open at its start, one that ends after it (its key, label and recorded id),
 * instead of minting a new slot the cascade would place after every projected one.
 */

import type { Event, TimeMin } from "../schemas";
import {
  isDreamFeed,
  isEngineEmittedId,
  isRecordedBottleId,
  recordedIdForEvent,
} from "./eventConventions";
import { isRenderSynthetic } from "./syntheticEvents";

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
   * Edit of a recorded bottle: the projection without that doc, where the slot it
   * stood in for is back. Its tag is re-decided against this.
   */
  projectionWithoutSource?: readonly Event[];
};

export function withRealizeTag(input: RealizeTagInput): Event {
  const { mode, source, saved } = input;
  if (saved.type === "nap") return mode === "create" ? intoFirstProjectedSlot(input) : saved;
  if (saved.type !== "bottle" || isDreamFeed(saved)) return saved;
  if (mode === "create") {
    return loggedAfterTheFactRealizes(input) ? { ...saved, realizedForecast: true } : saved;
  }
  if (saved.startTime === source.startTime) return saved;
  // A forecast edited in the drawer stands in for its own slot.
  if (isEngineEmittedId(source.id)) {
    return saved.startTime > source.startTime
      ? { ...saved, realizedForecast: true }
      : untagged(saved);
  }
  // Without that projection, untag: a forecast slot reappears beside the feed, where
  // a stale tag could silently absorb a slot the bottle no longer stands in for.
  // A recorded_bottle_t<T> doc began as a forecast, so unlike a FAB bottle it may
  // stand in for a slot after now.
  const without = input.projectionWithoutSource;
  return without &&
    loggedAfterTheFactRealizes(
      { ...input, projection: without },
      { pastOnly: !isRecordedBottleId(source.id) },
    )
    ? { ...saved, realizedForecast: true }
    : untagged(saved);
}

/**
 * DOMAIN.md §3: a nap he does take is the nap it was. A FAB nap at any time takes the
 * first projected slot that ends after its start, so a nap set inside or ahead of a slot
 * is that slot and order follows the clock; one later than every projected slot is the
 * new slot the FAB minted.
 */
function intoFirstProjectedSlot(input: RealizeTagInput): Event {
  const { saved, projection } = input;
  const slot = projection
    .filter((e) => e.type === "nap" && isEngineEmittedId(e.id) && !isRenderSynthetic(e))
    .filter((e) => (e.endTime ?? e.startTime) > saved.startTime)
    .sort((a, b) => a.startTime - b.startTime)[0];
  if (!slot) return saved;
  const keyed = { ...saved, eventKey: slot.eventKey, label: slot.label };
  return { ...keyed, id: recordedIdForEvent(keyed) };
}

// Explicit false, not a deleted key: saveEvent updates an existing doc with a merge
// (updateDoc and the optimistic spread), so an absent key would keep a stored `true`.
function untagged(event: Event): Event {
  return { ...event, realizedForecast: false };
}

/**
 * DOMAIN.md §2: a feed logged after the fact replaces the forecast slot nearest it.
 * Tag only when that slot is the bottle just before it, within one interval, with no
 * closer slot after it.
 */
function loggedAfterTheFactRealizes(input: RealizeTagInput, { pastOnly = true } = {}): boolean {
  const { saved, projection, nowMinutes, intervalMinutes } = input;
  const t = saved.startTime;
  if (pastOnly && t > nowMinutes) return false;
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
