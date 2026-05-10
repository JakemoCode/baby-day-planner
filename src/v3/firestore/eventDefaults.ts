/**
 * V3 Event defensive defaults.
 *
 * Bridges V2-shape Firestore docs into V3 shape on read. V2 docs use:
 *   - startTime / endTime as "HH:MM" strings (V3: TimeMin numbers)
 *   - source / status / recorded triplet (V3: lifecycle discriminated union)
 *   - owner as a free string display name (V3: slot-based OwnerRef)
 *   - no `kind` field (V3 always carries it)
 *   - no `hasPutdown` field (V3: render-only flag, default false)
 *
 * Transitional safety net so the engine doesn't crash on
 * `undefined.lifecycle.state` and the renderer doesn't display NaN
 * times when reading docs that predate the cutover. Once V2 reads
 * stop, this either retires or stays as cheap insurance.
 */

import type {
  Event,
  EventKind,
  EventType,
  Lifecycle,
  OwnerRef,
  OwnersConfig,
  TimeMin,
} from "../schemas";

type V2EventLike = {
  id?: string;
  dayId?: string;
  eventKey?: string;
  type?: EventType;
  kind?: EventKind;
  startTime?: string | TimeMin;
  endTime?: string | TimeMin;
  label?: string;
  owner?: string | OwnerRef;
  amountOz?: number;
  hasPutdown?: boolean;
  lifecycle?: Lifecycle;
  source?: string;
  status?: string;
  recorded?: boolean;
};

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function asTimeMin(value: string | TimeMin | undefined): TimeMin | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  const m = TIME_RE.exec(value);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return undefined;
  return h * 60 + min;
}

function deriveLifecycle(input: V2EventLike, startMin: TimeMin): Lifecycle {
  if (input.lifecycle) return input.lifecycle;
  if (input.status === "overridden") {
    return { state: "overridden", annotatedAt: startMin };
  }
  if (input.recorded === true) {
    if (input.endTime === undefined && (input.kind === "block" || input.type === "nap")) {
      return { state: "started", committedAt: startMin };
    }
    return { state: "completed", committedAt: startMin };
  }
  return { state: "projected" };
}

function deriveKind(input: V2EventLike): EventKind {
  if (input.kind) return input.kind;
  if (input.type === "nap" || input.type === "bedtime" || input.type === "wake_window") {
    return "block";
  }
  if (input.type === "extra" && input.endTime !== undefined) return "block";
  return "instant";
}

function deriveOwner(input: V2EventLike, owners?: OwnersConfig): OwnerRef | undefined {
  const raw = input.owner;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "object") return raw;
  // V2 owners were free display strings. When an owners config is
  // available, look the string up against the configured displayNames so
  // we can recover the original slot identity. Otherwise (or on miss),
  // fall back to parent1 so the engine has *something*; the user can
  // re-edit in the drawer to fix it.
  if (owners) {
    if (raw === owners.parent1.displayName) return { slot: "parent1" };
    if (raw === owners.parent2.displayName) return { slot: "parent2" };
    const match = owners.other.find((o) => o.displayName === raw);
    if (match) return { slot: "other", otherId: match.id };
  }
  return { slot: "parent1" };
}

export function withV3EventDefaults(input: Event | V2EventLike, owners?: OwnersConfig): Event {
  const raw = input as V2EventLike;
  const startTime = asTimeMin(raw.startTime) ?? 0;
  const endTime = asTimeMin(raw.endTime);
  const owner = deriveOwner(raw, owners);
  const lifecycle = deriveLifecycle(raw, startTime);
  const kind = deriveKind(raw);

  const out: Event = {
    id: raw.id ?? "",
    dayId: raw.dayId ?? "",
    eventKey: raw.eventKey ?? "",
    type: (raw.type ?? "extra") as EventType,
    kind,
    startTime,
    label: raw.label ?? "",
    hasPutdown: raw.hasPutdown ?? false,
    lifecycle,
  };

  if (endTime !== undefined) out.endTime = endTime;
  if (raw.amountOz !== undefined) out.amountOz = raw.amountOz;
  if (owner !== undefined) out.owner = owner;

  return out;
}
