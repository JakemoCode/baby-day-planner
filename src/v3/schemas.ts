/**
 * V3 type system.
 *
 * Source of truth: docs/v3/ARCHITECTURE_V3.md §1, REQUIREMENTS.md §1.
 *
 * Conventions:
 * - Time is integer minutes since midnight (TimeMin), 24+ for cross-day.
 *   String formatting happens at the UI boundary only.
 * - Owner references are slot-based (parent1 / parent2 / other[id]); the
 *   engine never inspects display strings.
 * - Lifecycle is a discriminated union; recorded === state ∈ {started, completed}.
 */

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Minutes since local midnight. 24*60 = next-day 00:00; 30*60 = 06:00 next day. */
export type TimeMin = number;

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

export type OwnerSlot = "parent1" | "parent2";

export type OwnerRef = { slot: OwnerSlot } | { slot: "other"; otherId: string };

/**
 * Two OwnerRefs match if they refer to the same slot identity.
 * Display-name strings are NOT consulted.
 */
export function ownerRefEquals(a: OwnerRef, b: OwnerRef): boolean {
  if (a.slot !== b.slot) return false;
  if (a.slot === "other" && b.slot === "other") {
    return a.otherId === b.otherId;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * Hard list — exhaustive switch should be possible everywhere.
 * V2's `'putdown'` and `'wake'` are intentionally absent:
 *   - putdown is render-only (R6.1); use Event.hasPutdown.
 *   - wake is derived from Day.wakeTime (R14.4).
 */
export type EventType =
  | "nap"
  | "wake_window"
  | "bottle"
  | "bedtime"
  | "dream_feed"
  | "pump"
  | "extra"
  | "daily_recurring"
  | "daycare_dropoff"
  | "daycare_pickup";

export type EventKind = "block" | "instant";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Discriminated union replacing V2's source + status + recorded triplet.
 *
 *   projected   — engine output, never persisted
 *   started     — block-only; user tapped Start, no End yet
 *   completed   — fully recorded (instants jump straight here)
 *   overridden  — user assigned an owner on a still-future projection
 *
 * Only block-kind events (nap, bedtime, durational extras) reach `started`.
 * Instant events transition `projected → completed` in one step (R5.13 etc).
 */
export type Lifecycle =
  | { state: "projected" }
  | { state: "started"; committedAt: TimeMin }
  | { state: "completed"; committedAt: TimeMin }
  | { state: "overridden"; annotatedAt: TimeMin };

/** True when the event is a recording of reality (started or completed). */
export function isRecorded(lifecycle: Lifecycle): boolean {
  return lifecycle.state === "started" || lifecycle.state === "completed";
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

/**
 * Wake windows ALWAYS carry a synthetic `lifecycle: {state: 'projected'}`.
 * They are derived from nap interval rules; never user-recorded directly.
 */
export type Event = {
  /** Firestore doc id (collision-safe via crypto.randomUUID() — see newEventId). */
  id: string;
  /** Parent day. */
  dayId: string;
  /** Semantic slot identifier: "nap_2", "bedtime", "wake_window_1". */
  eventKey: string;

  type: EventType;
  /** Derived from type+endTime; explicit so dispatch is cheap. */
  kind: EventKind;

  startTime: TimeMin;
  /** Present iff kind === 'block'. */
  endTime?: TimeMin;

  label: string;
  owner?: OwnerRef;
  /** bottle / dream_feed only. */
  amountOz?: number;

  /**
   * Render-only flag. true ⇒ renderer prepends a virtual putdown block.
   * Putdown itself is never persisted (R6.1); the parent event is what's stored.
   */
  hasPutdown: boolean;

  lifecycle: Lifecycle;
};

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

export type DayStatus = "planned" | "active" | "archived";

export type Day = {
  id: string;
  childId: string;
  /** ISO date string in local time, e.g. "2026-05-08". */
  date: string;
  status: DayStatus;
  /** Set when "End Bedtime" of yesterday's bedtime closes today. */
  wakeTime?: TimeMin;
  /** Per-day skip list for recurring events (R11.6). */
  suppressedRecurringIds: string[];
  /** Per-day daycare opt-out (R21.5). */
  suppressedDaycareDay: boolean;
  /** Optional template id selected for this day. */
  templateId?: string;
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Owner-list slot. `undefined` means "no owner assigned at this index" —
 * used for sparse writes (e.g. setting nap_3's owner before nap_2 has one).
 * The engine's R12.x rules already gate on `owner ? { ...e, owner } : e`,
 * so undefined entries are simply skipped at projection time.
 */
export type OwnerSlotEntry = OwnerRef | undefined;

export type OwnershipTemplate = {
  id: string;
  /** User-named (R13.1): "Saturday", "Half-day Friday", "Travel", etc. */
  displayName: string;
  napOwners: OwnerSlotEntry[];
  /** Template-only; no fallback to nap (R12.3, R4.1). */
  wakeWindowOwners: OwnerSlotEntry[];
  bottleOwners?: OwnerSlotEntry[];
  /** No lastNapOwner fallback (R12.5). */
  bedtimeOwner?: OwnerRef;
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type WeekdayFlags = Record<Weekday, boolean>;

export type DailyRecurring = {
  id: string;
  label: string;
  time: TimeMin;
  durationMinutes?: number;
  defaultOwnerSlot?: OwnerSlot;
  enabled: boolean;
};

export type OwnersConfig = {
  parent1: { displayName: string; color: string };
  parent2: { displayName: string; color: string };
  other: Array<{ id: string; displayName: string; color: string }>;
};

export type DaycareConfig = {
  enabled: boolean;
  dropoffTime: TimeMin;
  pickupTime: TimeMin;
  /** References Settings.owners.other[].id — usually the "Daycare" entry. */
  ownerId: string;
  weekdays: WeekdayFlags;
};

export type BottleChainConfig = {
  /** Expected lower limit of daily intake (R5.11). Drives placeholder projection. */
  bottlesPerDay: number;
  /**
   * Minutes between Day.wakeTime and the first placeholder bottle when
   * no bottle has been recorded yet (R5.11). Default 10. Avoids the
   * "first bottle exactly at wake time" false history (R5.10) while
   * still rendering an actionable forecast from minute one.
   */
  bufferAfterWakeMinutes: number;
};

export type BottleAmountRule = { minWeeks: number; amountOz: number };

/**
 * Amount-conditional interval rule. Ported from V2 (`src/domain/bottleRules.ts`
 * pre-cutover) — the V3 rewrite silently dropped this; restoring per
 * 2026-05-11 user feedback.
 *
 * Semantics: when the most-recent bottle's `amountOz` falls in `[minOz, maxOz]`
 * (or `[minOz, ∞)` when `maxOz` is undefined), the next bottle is projected
 * `intervalMinutes` later. Most-specific (narrowest range) wins on overlap.
 * When no rule matches, the engine falls back to `defaultBottleIntervalMinutes`.
 */
export type BottleIntervalRule = {
  minOz: number;
  maxOz?: number;
  intervalMinutes: number;
};

export type Settings = {
  childId: string;

  // Time defaults
  /** Drives bedtime endTime (R7.1) and the new-day boundary. */
  defaultWakeTime: TimeMin;

  // Bedtime & nap
  /** Probability shaper (R7.6). */
  bedtimeThreshold: TimeMin;
  /** Drives R7.6.1 convert-prompt window. */
  defaultNapLengthMinutes: number;
  shortNapThresholdMinutes: number;
  shortNapAdjustmentMinutes: number;
  /** Per-N wake-window minutes. Index N-1 corresponds to ww_N. */
  wakeWindowsMinutes: number[];

  // Validation soft bounds
  napDurationMin: number;
  napDurationMax: number;

  // Bottles
  defaultBottleAmountOz: number;
  defaultBottleIntervalMinutes: number;
  bottleRules: BottleAmountRule[];
  /** Amount-conditional next-bottle interval. See `BottleIntervalRule`. */
  bottleIntervalRules: BottleIntervalRule[];
  bottleChain: BottleChainConfig;
  minBottleIntervalMinutes: number;

  // Putdown (render-only)
  putdownLeadMinutes: number;

  // Pumps
  pumpTimes: TimeMin[];
  pumpOwnerSlot: OwnerSlot;

  // Dream feed
  dreamFeedEnabled: boolean;
  dreamFeedStart: TimeMin;
  dreamFeedEnd: TimeMin;
  dreamFeedOffsetAfterBedtimeMinutes: number;

  // Daily recurring
  dailyRecurring: DailyRecurring[];

  // Daycare
  daycare: DaycareConfig;

  // Owners
  owners: OwnersConfig;

  // Display
  /**
   * Whether timeline blocks encode event type via fill color (default) or
   * encode owner via fill color. V2 stored this; V3 had dropped it during
   * cutover and is now restored.
   */
  timelineColorMode: "type" | "owner";
  timelinePxPerHour: number;
  timelineDimPast: boolean;
};

// ---------------------------------------------------------------------------
// Allowlist (auth)
// ---------------------------------------------------------------------------

/** /config/allowlist Firestore singleton (R22). */
export type AllowlistDoc = {
  emails: string[];
  updatedAt: number; // ms epoch; Timestamp at the Firestore boundary
  updatedBy: string;
};

// ---------------------------------------------------------------------------
// Engine context
// ---------------------------------------------------------------------------

export type Context = {
  day: Day;
  settings: Settings;
  template?: OwnershipTemplate;
  /** User-recorded events from Firestore (lifecycle.state ∈ {started, completed}). */
  actuals: Event[];
  /** Current time as TimeMin; used for "now"-relative rules (R5.6, R6.7). */
  nowMinutes: TimeMin;
};

export type ProjectInput = {
  day: Day;
  settings: Settings;
  template?: OwnershipTemplate;
  actuals: Event[];
  nowMinutes?: TimeMin;
};
