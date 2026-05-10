/**
 * V3 Day defensive defaults.
 *
 * Bridges V2-shape and partial-V3 day docs into a fully-shaped V3 Day
 * on read. Two responsibilities:
 *
 *   1. Fill `suppressedRecurringIds` (default `[]`) and
 *      `suppressedDaycareDay` (default `false`). The engine reads these
 *      directly; if undefined, rules crash on `.includes` / boolean
 *      checks.
 *
 *   2. Remap V2 `ownershipTemplateId` → V3 `templateId`. V2 day docs
 *      stored the field under the old name; V3 reads `templateId`. The
 *      remap is the only V2-shape branch in this file and is targeted
 *      for deletion in PR-C1 once no V2 day docs remain.
 *
 * Applied in `v3DayConverter.fromFirestore` so all read paths
 * (`getDay`, `getDayByDate`, `listArchivedDays`, `watchActiveDay`)
 * benefit. Also applied in `useV3Day` for defense in depth (idempotent —
 * double-fill is a no-op).
 */

import type { Day } from "../schemas";

type V2OrV3DayLike = Partial<Day> & { ownershipTemplateId?: string };

export function withV3DayDefaults(input: V2OrV3DayLike | null): Day | null {
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

  // V3 templateId takes precedence over V2 ownershipTemplateId.
  // PR-C1 wipes the V2 fallback once no V2 day docs remain.
  const templateId = input.templateId ?? input.ownershipTemplateId;
  if (templateId !== undefined) {
    out.templateId = templateId;
  }

  return out;
}
