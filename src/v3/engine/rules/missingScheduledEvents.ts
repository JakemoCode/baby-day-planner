/**
 * Generic predicate shared by pump (R9.1) and daily-recurring (R11.2)
 * cascades: given a list of configured entries (each with a unique
 * eventKey) and the day's existing events, return the entries that
 * have no matching event in actuals.
 *
 * Used to skip projecting events the user already recorded — keeps the
 * "absent entries only" semantics consistent across rule families.
 */
export function missingScheduledEvents<T extends { eventKey: string }>(
  entries: T[],
  existing: ReadonlyArray<{ eventKey: string }>,
): T[] {
  const existingKeys = new Set(existing.map((e) => e.eventKey));
  return entries.filter((entry) => !existingKeys.has(entry.eventKey));
}
