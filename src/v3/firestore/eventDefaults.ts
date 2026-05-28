/**
 * V3 Event defensive defaults. Fills `hasPutdown` (default `false`) and
 * derives `kind` if missing. Also delegates a one-time lifecycle migration
 * (PR-#166): `started`/`overridden` → `recorded`. Applied only at
 * `v3EventConverter.fromFirestore` — the single canonical seam.
 */

import { NO_OWNER, type Event, type EventKind, type EventType } from "../schemas";
import { migrateLegacyLifecycle } from "../lifecycle";

function deriveKind(input: Partial<Event>): EventKind {
  if (input.kind) return input.kind;
  if (input.type === "nap" || input.type === "bedtime" || input.type === "wake_window") {
    return "block";
  }
  if (input.type === "extra" && input.endTime !== undefined) return "block";
  return "instant";
}

export function withV3EventDefaults(input: Partial<Event>): Event {
  const migratedLifecycle = migrateLegacyLifecycle(input.lifecycle, input.startTime ?? 0);
  const out: Event = {
    id: input.id ?? "",
    dayId: input.dayId ?? "",
    eventKey: input.eventKey ?? "",
    type: (input.type ?? "extra") as EventType,
    kind: deriveKind(input),
    startTime: input.startTime ?? 0,
    label: input.label ?? "",
    hasPutdown: input.hasPutdown ?? false,
    // owner is required; pre-existing docs missing the field migrate to NO_OWNER on read.
    owner: input.owner ?? NO_OWNER,
    lifecycle: migratedLifecycle ?? input.lifecycle ?? { state: "projected" },
  };

  if (input.endTime !== undefined) out.endTime = input.endTime;
  if (input.amountOz !== undefined) out.amountOz = input.amountOz;

  return out;
}
