/**
 * V2 ← V3 back-compat shims. Inverse of withV3SettingsDefaults /
 * withV3EventDefaults (PR #61 / #62): convert V3-shape Firestore docs
 * back into V2 shape on the V2 hook read path so V2 surfaces (Dashboard,
 * Tomorrow, History, Day-templates, AppShell) keep working while the
 * cross-surface cutover is in flight.
 *
 * Transitional. Each V2 surface that gets cut over to V3 stops needing
 * its corresponding back-compat call; once all surfaces are V3, this
 * file deletes.
 *
 * Direction of flow:
 *   V3 doc in Firestore (TimeMin numbers, lifecycle, slot OwnerRef)
 *     → withV2*Backcompat(...)
 *     → V2 Settings / V2 Event (HH:MM strings, source/status/recorded,
 *       string owner)
 *
 * The shape is best-effort. Fields V3 dropped or renamed get sensible
 * V2 defaults (e.g., V3 `dailyRecurring[]` → V2 `cookDinner: { enabled:
 * false }`). The legacy V2 dashboard / history continue to render; some
 * V2-only features (pump owner = the renamed concept) might be off.
 */

import type {
  Event as V2Event,
  EventSource,
  EventStatus,
  Owner as V2Owner,
  Settings as V2Settings,
} from "@/domain";
import type {
  Lifecycle,
  OwnerRef,
  OwnersConfig,
  Settings as V3Settings,
  TimeMin,
} from "../schemas";

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

function timeMinToHHMM(t: TimeMin | string | undefined): string | undefined {
  if (t === undefined) return undefined;
  if (typeof t === "string") return t; // already V2 shape
  const wrapped = ((t % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------

function ownerRefToV2(
  ref: OwnerRef | string | undefined,
  owners: OwnersConfig | undefined,
): V2Owner | undefined {
  if (ref === undefined || ref === null) return undefined;
  if (typeof ref === "string") {
    // Already V2 shape (free-string owner). Trust it as-is.
    return ref as V2Owner;
  }
  // V3 OwnerRef → look up displayName from owners config and cast to V2.
  if (!owners) return undefined;
  switch (ref.slot) {
    case "parent1":
      return owners.parent1.displayName as V2Owner;
    case "parent2":
      return owners.parent2.displayName as V2Owner;
    case "other": {
      const found = owners.other.find((o) => o.id === ref.otherId);
      return found ? (found.displayName as V2Owner) : undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Loose input — could be a V2 doc, V3 doc, or partial of either. */
type MaybeV3Settings = Record<string, unknown> & {
  childId?: string;
  bedtimeThreshold?: string | number;
  pumpTimes?: ReadonlyArray<string | number>;
  defaultBottleAmountOz?: number;
  defaultBottleIntervalMinutes?: number;
  defaultNapLengthMinutes?: number;
  putdownLeadMinutes?: number;
  shortNapThresholdMinutes?: number;
  shortNapAdjustmentMinutes?: number;
  wakeWindowsMinutes?: number[];
  bottleRules?: unknown[];
  minBottleIntervalMinutes?: number;
  timelinePxPerHour?: number;
  timelineDimPast?: boolean;
};

export function withV2SettingsBackcompat(input: MaybeV3Settings | null): V2Settings | null {
  if (input === null) return null;

  // bedtimeThreshold: V3 number, V2 string
  const bedtimeThreshold =
    typeof input.bedtimeThreshold === "number"
      ? timeMinToHHMM(input.bedtimeThreshold)!
      : (input.bedtimeThreshold ?? "19:00");

  // pumpTimes: array of TimeMin in V3, array of HH:MM strings in V2
  const pumpTimes = Array.isArray(input.pumpTimes)
    ? input.pumpTimes.map((t) => (typeof t === "number" ? timeMinToHHMM(t)! : (t as string)))
    : [];

  // dreamFeed: V2 had a nested object; V3 flattens into top-level fields.
  // Synthesize V2 shape from whichever side is present.
  const v3Settings = input as Partial<V3Settings>;
  const v2Settings = input as Partial<V2Settings>;
  const dreamFeed = v2Settings.dreamFeed ?? {
    enabled: v3Settings.dreamFeedEnabled ?? false,
    earliestTime: timeMinToHHMM(v3Settings.dreamFeedStart) ?? "20:30",
    latestTime: timeMinToHHMM(v3Settings.dreamFeedEnd) ?? "21:00",
    minMinutesAfterBedtime: v3Settings.dreamFeedOffsetAfterBedtimeMinutes ?? 90,
  };

  // cookDinner: V2 single nullable item; V3 dailyRecurring[] generalized.
  // Look for a "Cook Dinner" entry if dailyRecurring exists; else fall
  // back to the V2 field or disabled.
  const cookDinnerFromV3 = v3Settings.dailyRecurring?.find(
    (d) => d.label.toLowerCase().includes("cook") || d.label.toLowerCase().includes("dinner"),
  );
  const cookDinner =
    v2Settings.cookDinner ??
    (cookDinnerFromV3
      ? {
          enabled: cookDinnerFromV3.enabled,
          time: timeMinToHHMM(cookDinnerFromV3.time) ?? "17:00",
        }
      : { enabled: false, time: "17:00" });

  return {
    childId: input.childId ?? "",
    timelineColorMode: v2Settings.timelineColorMode ?? "type",
    timelinePxPerHour: input.timelinePxPerHour ?? 80,
    timelineDimPast: input.timelineDimPast ?? true,
    defaultBottleAmountOz: input.defaultBottleAmountOz ?? 5,
    defaultBottleIntervalMinutes: input.defaultBottleIntervalMinutes ?? 180,
    defaultNapLengthMinutes: input.defaultNapLengthMinutes ?? 60,
    putdownLeadMinutes: input.putdownLeadMinutes ?? 15,
    bedtimeThreshold,
    shortNapThresholdMinutes: input.shortNapThresholdMinutes ?? 35,
    shortNapAdjustmentMinutes: input.shortNapAdjustmentMinutes ?? 10,
    wakeWindowsMinutes: input.wakeWindowsMinutes ?? [120, 135, 135, 150],
    bottleRules: (input.bottleRules ?? []) as V2Settings["bottleRules"],
    dreamFeed,
    pumpTimes,
    minBottleIntervalMinutes: input.minBottleIntervalMinutes ?? 20,
    cookDinner,
  };
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

/** Loose input — could be a V2 doc, V3 doc, or partial of either. */
type MaybeV3Event = Record<string, unknown>;

function lifecycleToV2(
  lifecycle: Lifecycle | undefined,
  legacy: { source?: EventSource; status?: EventStatus; recorded?: boolean },
): { source: EventSource; status: EventStatus; recorded: boolean } {
  if (!lifecycle) {
    // Legacy V2 doc — trust the existing fields.
    return {
      source: legacy.source ?? "projected",
      status: legacy.status ?? "projected",
      recorded: legacy.recorded ?? false,
    };
  }
  if (lifecycle.state === "projected") {
    return { source: "projected", status: "projected", recorded: false };
  }
  if (lifecycle.state === "started") {
    return { source: "actual", status: "actual", recorded: true };
  }
  if (lifecycle.state === "completed") {
    return { source: "actual", status: "completed", recorded: true };
  }
  // overridden
  return { source: "manual", status: "overridden", recorded: false };
}

export function withV2EventBackcompat(input: MaybeV3Event, owners?: OwnersConfig): V2Event {
  const startTimeRaw = input.startTime;
  const startTime =
    typeof startTimeRaw === "number"
      ? (timeMinToHHMM(startTimeRaw) ?? "00:00")
      : typeof startTimeRaw === "string"
        ? startTimeRaw
        : "00:00";

  const endTimeRaw = input.endTime;
  const endTime =
    typeof endTimeRaw === "number"
      ? timeMinToHHMM(endTimeRaw)
      : typeof endTimeRaw === "string"
        ? endTimeRaw
        : undefined;

  const lifecycleFields = lifecycleToV2(input.lifecycle as Lifecycle | undefined, {
    ...(input.source !== undefined ? { source: input.source as EventSource } : {}),
    ...(input.status !== undefined ? { status: input.status as EventStatus } : {}),
    ...(input.recorded !== undefined ? { recorded: input.recorded as boolean } : {}),
  });

  const owner = ownerRefToV2(input.owner as OwnerRef | string | undefined, owners);

  const type = (input.type ?? "extra") as V2Event["type"];
  const kind = (input.kind ?? (type === "nap" ? "block" : "instant")) as V2Event["kind"];

  const out: V2Event = {
    id: (input.id as string) ?? "",
    dayId: (input.dayId as string) ?? "",
    eventKey: (input.eventKey as string) ?? "",
    type,
    kind,
    label: (input.label as string) ?? "",
    startTime,
    source: lifecycleFields.source,
    status: lifecycleFields.status,
    recorded: lifecycleFields.recorded,
  };

  if (endTime !== undefined) out.endTime = endTime;
  if (input.amountOz !== undefined) out.amountOz = input.amountOz as number;
  if (owner !== undefined) out.owner = owner;

  return out;
}
