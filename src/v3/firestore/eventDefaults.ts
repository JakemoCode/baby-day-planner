/**
 * V3 Event defensive defaults.
 *
 * Defense-in-depth normalizer applied at the converter boundary. Fills
 * `hasPutdown` (default `false`) and ensures `kind` is set; everything
 * else is passed through. V3 docs are already fully shaped; this is
 * insurance against partial writes / hand-edited docs.
 *
 * Used by `v3EventConverter.fromFirestore` — the single canonical seam.
 */

import type { Event, EventKind, EventType } from "../schemas";

function deriveKind(input: Partial<Event>): EventKind {
  if (input.kind) return input.kind;
  if (input.type === "nap" || input.type === "bedtime" || input.type === "wake_window") {
    return "block";
  }
  if (input.type === "extra" && input.endTime !== undefined) return "block";
  return "instant";
}

export function withV3EventDefaults(input: Partial<Event>): Event {
  const out: Event = {
    id: input.id ?? "",
    dayId: input.dayId ?? "",
    eventKey: input.eventKey ?? "",
    type: (input.type ?? "extra") as EventType,
    kind: deriveKind(input),
    startTime: input.startTime ?? 0,
    label: input.label ?? "",
    hasPutdown: input.hasPutdown ?? false,
    lifecycle: input.lifecycle ?? { state: "projected" },
  };

  if (input.endTime !== undefined) out.endTime = input.endTime;
  if (input.amountOz !== undefined) out.amountOz = input.amountOz;
  if (input.owner !== undefined) out.owner = input.owner;

  return out;
}
