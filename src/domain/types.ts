export type Owner = "Jake" | "Kelly" | "Daycare";

export type EventType =
  | "wake"
  | "wake_window"
  | "putdown"
  | "nap"
  | "bottle"
  | "pump"
  | "bedtime"
  | "dream_feed"
  | "extra";

export type EventSource = "actual" | "projected" | "manual" | "template";
export type EventStatus = "projected" | "actual" | "overridden" | "completed";

/**
 * Discriminator for Timeline v2 layout: blocks have duration and render in the
 * center lane; instants have no duration and render as chips in the right
 * gutter. Persisted on every new write; legacy docs without `kind` are coerced
 * via `deriveKind` in the Firestore converter.
 */
export type EventKind = "block" | "instant";

export type Event = {
  id: string;
  dayId: string;
  eventKey: string;
  type: EventType;
  kind: EventKind;
  label: string;
  startTime: string; // "HH:MM" or "HH:MM" with hours 24+ for cross-midnight
  endTime?: string;
  owner?: Owner;
  amountOz?: number;
  source: EventSource;
  status: EventStatus;
  /**
   * Single source of truth for "did the user actually commit this event?"
   *
   *   - false: a projection from the engine, OR a stale annotation that
   *            shouldn't count toward dashboard ordinals or block overlap
   *            validation. Engine recalculates around these freely.
   *   - true:  user explicitly recorded this — Start/End Nap, Start
   *            Bottle Now, FAB-create on /timeline, or any drawer save.
   *            Counters, overlap validation, and applyNapActuals/etc. all
   *            anchor against `recorded: true` events only.
   *
   * Independent from `source` (provenance) and `status` (lifecycle stage).
   * Legacy docs without this field are coerced via deriveRecorded in the
   * Firestore converter.
   */
  recorded: boolean;
};

/**
 * Convenience builder for Event values: takes everything except `kind` and
 * (optionally) `recorded`, filling them in via the helpers. `recorded`
 * defaults via `deriveRecorded` based on source — engine projections come
 * out false, explicit user actions (source: "actual") come out true.
 * Callers can pass an explicit `recorded` to override (e.g. drawer save).
 */
export function makeEvent(props: Omit<Event, "kind" | "recorded"> & { recorded?: boolean }): Event {
  const { recorded, ...rest } = props;
  return {
    ...rest,
    kind: deriveKind(props.type, props.endTime),
    recorded: recorded ?? deriveRecorded(props.source, props.status),
  };
}

/**
 * Derive `recorded` for legacy docs that predate the explicit field, and
 * for engine emissions via makeEvent. Conservative on ambiguous statuses:
 *
 *   - source "projected" → false (engine output)
 *   - source "actual"    → true  (user pressed Start/End buttons)
 *   - status "overridden" → false (legacy drawer annotation; new code
 *                                  saves "completed" instead, so this
 *                                  branch only catches old garbage)
 *   - status "completed" → true (explicit completion)
 *   - status "actual"    → true (in-progress recording)
 *   - everything else    → false
 */
export function deriveRecorded(source: EventSource, status: EventStatus): boolean {
  if (source === "projected") return false;
  if (source === "actual") return true;
  if (status === "actual" || status === "completed") return true;
  return false;
}

/**
 * Derive the layout `kind` from an event's `type` and `endTime`. Source of
 * truth for legacy docs (which predate the explicit `kind` field) and for
 * engine code that constructs events without copy-pasting the rule.
 *
 *   - wake_window / nap / putdown → always block
 *   - extra → block if endTime is set, instant otherwise
 *   - everything else (bottle/pump/bedtime/dream_feed/wake) → instant
 */
export function deriveKind(type: EventType, endTime?: string): EventKind {
  if (type === "wake_window" || type === "nap" || type === "putdown") return "block";
  if (type === "extra" && endTime !== undefined) return "block";
  return "instant";
}

export type BottleRule = {
  minOz: number;
  maxOz?: number; // open-ended if undefined
  intervalMinutes: number;
};

export type DreamFeedSettings = {
  enabled: boolean;
  earliestTime: string; // "HH:MM"
  latestTime: string; // "HH:MM" (cap, max 21:00 per PRD)
  minMinutesAfterBedtime: number; // default 90
};

export type Settings = {
  childId: string;
  defaultBottleAmountOz: number;
  defaultBottleIntervalMinutes: number; // fallback when no rule matches
  defaultNapLengthMinutes: number;
  putdownLeadMinutes: number;
  bedtimeThreshold: string; // "HH:MM"
  shortNapThresholdMinutes: number;
  shortNapAdjustmentMinutes: number;
  wakeWindowsMinutes: number[];
  bottleRules: BottleRule[];
  dreamFeed: DreamFeedSettings;
  pumpTimes: string[]; // "HH:MM"[]
  /**
   * "Are you sure?" guard: if Start Bottle Now is tapped within this many
   * minutes of the most recent bottle, the UI shows a confirm dialog before
   * recording the new event. Optional to keep older Settings docs valid;
   * UI falls back to 20 when missing.
   */
  minBottleIntervalMinutes?: number;
  /**
   * Timeline v2 display settings. All optional so legacy Settings docs
   * remain valid; the timeline component falls back to the defaults below
   * when a field is missing. See TIMELINE_V2_PLAN.md §8.
   */
  timelineColorMode?: "type" | "owner"; // default "type"
  timelinePxPerHour?: number; // default 120, valid range 70-220
  timelineDimPast?: boolean; // default true
};

/** Defaults for the optional Timeline v2 display fields. */
export const TIMELINE_DEFAULTS = {
  colorMode: "type" as const,
  pxPerHour: 120,
  dimPast: true,
};

export type Day = {
  id: string;
  childId: string;
  date: string; // "YYYY-MM-DD"
  status: "planned" | "active" | "archived";
  wakeTime?: string; // "HH:MM"
  ownershipTemplateId?: string;
  createdAt: string;
  archivedAt?: string;
};

export type OwnershipTemplate = {
  id: string;
  label: string; // e.g. "Saturday"
  napOwners: Owner[]; // index = nap N - 1
  wakeWindowOwners: Owner[]; // index = ww N - 1
  bottleOwners?: Owner[]; // index = bottle N - 1; optional for back-compat
};

export type ProjectInput = {
  day: Day;
  settings: Settings;
  actuals: Event[]; // events with source: "actual" | "manual"
  template?: OwnershipTemplate;
  nowMinutes?: number; // for "now" comparisons in overlap rule; default = end of day
};
