/**
 * V3 Day defensive defaults. Fills `suppressedRecurringIds` (default `[]`)
 * and `suppressedDaycareDay` (default `false`) on read — engine rules crash on
 * `.includes`/boolean checks if these are undefined. Applied in
 * `v3DayConverter.fromFirestore` so all read paths receive a fully-shaped Day.
 */

import type { Day } from "../schemas";

export function withV3DayDefaults(input: Partial<Day> | null): Day | null {
  if (input === null) return null;

  const out: Day = {
    id: input.id ?? "",
    childId: input.childId ?? "",
    date: input.date ?? "",
    status: input.status ?? "active",
    suppressedRecurringIds: input.suppressedRecurringIds ?? [],
    suppressedDaycareDay: input.suppressedDaycareDay ?? false,
    suppressedDreamFeed: input.suppressedDreamFeed ?? false,
  };

  if (input.wakeTime !== undefined) {
    out.wakeTime = input.wakeTime;
  }
  if (input.templateId !== undefined) {
    out.templateId = input.templateId;
  }
  if (input.ownerOverrides !== undefined) {
    out.ownerOverrides = input.ownerOverrides;
  }

  return out;
}
