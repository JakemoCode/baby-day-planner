import type { Event } from "../schemas";

/**
 * Returns a sortable timestamp for dedup ranking: most-recently-annotated
 * event wins. Returns -1 for events with no annotation timestamp (e.g.
 * planned events), so they sort last.
 */
export function annotationTime(e: Event): number {
  if (e.lifecycle.state === "recorded") return e.lifecycle.annotatedAt;
  if (e.lifecycle.state === "completed") return e.lifecycle.committedAt;
  return -1;
}
