/**
 * Shared by pump (R9.1) and daily-recurring (R11.2) cascades: returns entries
 * with no matching eventKey in actuals — skips already-recorded events.
 */
export function missingScheduledEvents<T extends { eventKey: string }>(
  entries: T[],
  existing: ReadonlyArray<{ eventKey: string }>,
): T[] {
  const existingKeys = new Set(existing.map((e) => e.eventKey));
  return entries.filter((entry) => !existingKeys.has(entry.eventKey));
}
