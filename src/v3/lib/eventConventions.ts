/**
 * Shared event naming + id conventions.
 *
 * Centralizes the magic strings the engine, drawer, and persistence
 * paths all agree on. Drift across these sites previously caused real
 * bugs (PR #186: timeline used `recorded_${eventKey}` while dashboard
 * used a random suffix; same-slot edits orphaned a duplicate doc).
 */

/**
 * Id prefix the engine uses on emitted projected events
 * (`proj_bottle_t${startTime}`, `proj_nap_${n}`, `proj_bedtime`, etc.).
 * Auto-promote (evaluator Now-cross) keeps this id; the doc only
 * gains a `recorded_*` id when it's persisted via the drawer save
 * path, the Log-bottle-now flow, or `useAutoPromotePersistence`.
 */
export const ENGINE_PROJECTED_ID_PREFIX = "proj_";

export function isEngineEmittedId(id: string): boolean {
  return id.startsWith(ENGINE_PROJECTED_ID_PREFIX);
}

/**
 * Deterministic Firestore doc id for a recorded event derived from
 * its eventKey (§F59). Idempotent: re-saving the same slot overwrites
 * one doc instead of orphaning a `proj_*` and a `recorded_*` pair.
 */
export function recordedIdFor(eventKey: string): string {
  return `recorded_${eventKey}`;
}

/**
 * Dream-feed eventKey sentinel. Type "bottle" but explicitly outside
 * the rhythm cascade chain (R5.5) — it's a fixed-time post-bedtime
 * slot, never an anchor. Cascade-walking sites (trim, renumber,
 * chronological index, isFutureProjected) all skip it.
 */
export const DREAM_FEED_EVENT_KEY = "bottle_dream";

export function isDreamFeed(e: { eventKey: string }): boolean {
  return e.eventKey === DREAM_FEED_EVENT_KEY;
}
