import type { Event } from "../schemas";

/** Sortable annotation timestamp for dedup ranking; -1 for non-annotated (projected) events. */
export function annotationTime(e: Event): number {
  if (e.lifecycle.state === "recorded") return e.lifecycle.annotatedAt;
  if (e.lifecycle.state === "completed") return e.lifecycle.committedAt;
  return -1;
}
