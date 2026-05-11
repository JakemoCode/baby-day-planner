/**
 * V3 Day defensive defaults.
 *
 * Fills `suppressedRecurringIds` (default `[]`) and
 * `suppressedDaycareDay` (default `false`) on read. The engine reads
 * these directly; if undefined, rules crash on `.includes` / boolean
 * checks.
 *
 * Applied in `v3DayConverter.fromFirestore` so all read paths
 * (`getDay`, `getDayByDate`, `listArchivedDays`, `watchActiveDay`)
 * benefit. Also applied in `useV3Day` for defense in depth (idempotent —
 * double-fill is a no-op).
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
  };

  if (input.wakeTime !== undefined) {
    out.wakeTime = input.wakeTime;
  }
  if (input.templateId !== undefined) {
    out.templateId = input.templateId;
  }

  return out;
}
