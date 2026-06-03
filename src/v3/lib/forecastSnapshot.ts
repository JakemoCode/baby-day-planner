/**
 * §F66 Slice 4 — day-close history snapshot.
 *
 * Projections are ephemeral during the active day (never persisted on view — that
 * was the zombie/flicker root). But archived days read STATIC docs with no recompute,
 * so to preserve the forecast-that-happened in history we freeze it ONCE at day-close:
 * the closing day's engine-emitted (`proj_`) bottles become recorded docs.
 *
 * Bottle-scoped (matches the retired auto-promote hook): naps/bedtime have explicit
 * confirmation flows and are persisted when recorded; the dream-feed is excluded.
 */

import type { Event } from "../schemas";
import { isDreamFeed, isEngineEmittedId, recordedIdForEvent } from "./eventConventions";
import { recordedLifecycle } from "../lifecycle";

/**
 * The recorded docs to write for the closing day so its forecast survives in history.
 * Takes the closing day's projection; returns its not-yet-persisted bottles as
 * recorded events (deterministic id, recorded lifecycle, re-homed to the closing day).
 */
export function forecastSnapshotDocs(projected: Event[], closingDayId: string): Event[] {
  return projected
    .filter((e) => e.type === "bottle" && isEngineEmittedId(e.id) && !isDreamFeed(e))
    .map((e) => ({
      ...e,
      id: recordedIdForEvent(e),
      dayId: closingDayId,
      lifecycle: recordedLifecycle(e.startTime),
    }));
}
