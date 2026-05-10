/**
 * Collision-safe event id generator. Uses `crypto.randomUUID()` (Node
 * 22+ + browsers since Chrome 92 / Firefox 95 / Safari 15.4 — all
 * target environments).
 *
 * Replaces every `${prefix}-${Date.now()}` pattern that previously
 * lived in V3 code; PR-C1's pre-merge audit greps for `Date.now()` in
 * V3 id-generation paths to ensure none re-appear.
 */

export function newEventId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
