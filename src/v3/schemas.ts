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
 * - Lifecycle is a discriminated union; recorded === state ∈ {recorded, completed}.
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

/**
 * Owner assignment on an event. Uses `{ slot: "none" }` for unassigned rather than
 * `undefined` for two reasons: (1) Firestore `updateDoc` is field-merge — omitting `owner`
 * leaves the stale value; writing `none` clears it explicitly. (2) "User said no owner" is
 * semantically distinct from "field never set."
 *
 * `OwnerSlot` (parent1/parent2) is the narrower type for Settings fields that MUST resolve to a real parent.
 */
export type OwnerRef = { slot: OwnerSlot } | { slot: "other"; otherId: string } | { slot: "none" };

export const NO_OWNER: OwnerRef = { slot: "none" };

/** True iff this OwnerRef means "no owner assigned." */
export function isNoOwner(ref: OwnerRef): boolean {
  return ref.slot === "none";
}

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
 *   recorded    — user has anchored at least one timestamp; event is real.
 *                 Placeholder endTime may still auto-extend for in-progress naps.
 *   completed   — user has anchored both start AND end timestamps
 *
 * Instants jump straight from projected → completed.
 * Blocks (nap, bedtime) go projected → recorded → completed.
 */
export type Lifecycle =
  | { state: "projected" }
  | { state: "recorded"; annotatedAt: TimeMin }
  | { state: "completed"; committedAt: TimeMin };

/** True when the event is a recording of reality (recorded or completed). */
export function isRecorded(lifecycle: Lifecycle): boolean {
  return lifecycle.state === "recorded" || lifecycle.state === "completed";
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
  /**
   * Owner is always present (2026-05-18). Use `{ slot: "none" }`
   * (or the `NO_OWNER` constant) for unassigned. Old documents missing
   * the field are auto-promoted to `NO_OWNER` by `withV3EventDefaults`
   * at the read seam.
   */
  owner: OwnerRef;
  /** bottle only. */
  amountOz?: number;
  /** pump only. Per-side recorded output in ounces; session total = left + right. */
  pumpVolumeOz?: { left: number; right: number };

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
  /** Per-day dream-feed opt-out. R5.5 skips emission when true. */
  suppressedDreamFeed?: boolean;
  /** Optional template id selected for this day. */
  templateId?: string;
  /**
   * Per-event owner overrides keyed by `eventKey`
   * (e.g. `"nap_1"`, `"bottle_2"`). Carried forward from the
   * `TomorrowPlan` at promote time. `null` = explicit NO_OWNER;
   * missing key = no override (default cascade applies). The
   * engine reads this during projection to color projected events
   * with the user's planned assignments.
   */
  ownerOverrides?: Record<string, OwnerRef | null>;
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

/**
 * (2026-05-20): `color` fields were retired from the editor — owner
 * colors are now slot-keyed via `--color-owner-*` tokens. The field
 * stays optional on the type so persisted pre-existing docs continue to
 * validate; nothing reads it anymore.
 */
export type OwnersConfig = {
  parent1: { displayName: string; color?: string };
  parent2: { displayName: string; color?: string };
  other: Array<{ id: string; displayName: string; color?: string }>;
};

export type DaycareConfig = {
  enabled: boolean;
  /**
   * Nominal dropoff time. The engine shifts this forward to the end of
   * any in-progress nap (R21.2) — Settings is the *approximate* time,
   * not a wake-the-baby-up alarm.
   */
  dropoffTime: TimeMin;
  /** Nominal pickup time — same nap-shift behavior as dropoffTime. */
  pickupTime: TimeMin;
  /** Back-compat with pre-2026-05-20 docs. Read-ignored; daycare events are now owner-less by default, assigned per-day. */
  dropoffOwnerSlot?: OwnerSlot;
  pickupOwnerSlot?: OwnerSlot;
  weekdays: WeekdayFlags;
};

export type BottleChainConfig = {
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
 * Amount-conditional interval rule (ported from V2; silently dropped in initial V3 rewrite, restored 2026-05-11).
 * When the last bottle's `amountOz` falls in `[minOz, maxOz)` (or `[minOz, ∞)` when `maxOz` undefined),
 * the next bottle projects `intervalMinutes` later. Narrowest range wins; falls back to `defaultBottleIntervalMinutes`.
 */
export type BottleIntervalRule = {
  minOz: number;
  maxOz?: number;
  intervalMinutes: number;
};

/**
 * One pump session in the daily pump schedule. The optional
 * `durationMinutes` is a per-session override; when absent, the engine
 * uses `Settings.defaultPumpDurationMinutes`.
 */
export type PumpSession = {
  time: TimeMin;
  durationMinutes?: number;
};

export type Settings = {
  childId: string;

  // Time defaults
  /** Drives bedtime endTime (R7.1) and the new-day boundary. */
  defaultWakeTime: TimeMin;

  // Bedtime & nap
  /** Latest endTime allowed for a projected nap; cascade naps exceeding this are dropped (R7.6, ADR-0002). */
  bedtimeThreshold: TimeMin;
  /** Floor for projected bedtime startTime — `max(earliestBedtime, lastNapEnd + WW)` (ADR-0002). Ignored for recorded bedtime. */
  earliestBedtime: TimeMin;
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
  pumpTimes: PumpSession[];
  pumpOwnerSlot: OwnerSlot;
  /** Default duration of a pump session; pumps render as blocks of this length. */
  defaultPumpDurationMinutes: number;

  // Dream feed — when enabled, R5.5 emits a projected bottle at `dreamFeedTime`.
  // Renderer labels it "Dream Feed". Subject to Now-cross auto-promote (ADR-0001).
  dreamFeedEnabled: boolean;
  /** TimeMin for the projected dream-feed bottle (e.g. 23 * 60 = 11pm). */
  dreamFeedTime: TimeMin;

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
  /** User-recorded events from Firestore (lifecycle.state ∈ {recorded, completed}). */
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

/**
 * TomorrowPlan — user's per-date plan for "tomorrow". Persisted only on first edit.
 * Auto-promoted on calendar rollover when `status === "confirmed"` (docs/v3/F17_F12_SCOPE.md).
 *
 * - `status`: `"draft"` autosaves but does NOT auto-promote; `"confirmed"` is eligible; any edit reverts to draft.
 * - `ownerOverrides`: keyed by eventKey; `null` = explicit None; missing key = no override (cascade default).
 * - `extras`: FAB-added custom events, land as projected events at promote time.
 * - `startTemplateId`: one-shot prefill template, stored for traceability. Template edits do NOT propagate.
 */
export type TomorrowPlan = {
  childId: string;
  /** ISO "YYYY-MM-DD" — matches `Day.date`. */
  date: string;
  status: "draft" | "confirmed";
  wakeTime?: TimeMin;
  confirmedAt?: TimeMin;
  ownerOverrides: Record<string, OwnerRef | null>;
  extras: Event[];
  startTemplateId?: string;
};

/**
 * Child — identity record at `/children/{id}/`. Child-scoped subcollections live underneath.
 * `createdBy` is the onboarding uid; co-parents are linked via `/users/{uid}.childIds`.
 */
export type Child = {
  id: string;
  displayName: string;
  /** ISO "YYYY-MM-DD". */
  dateOfBirth: string;
  /** ms epoch. */
  createdAt: number;
  /** Auth uid of the onboarding user. */
  createdBy: string;
};

/**
 * User — per-uid record at `/users/{uid}/` mapping auth users to accessible children.
 * Doc existence = "introduced to app"; empty `childIds` = signed in but not yet onboarded.
 */
export type User = {
  uid: string;
  childIds: string[];
  /** ms epoch. */
  createdAt: number;
};

/**
 * Invite — single-use co-parent invite at `/invites/{token}`.
 * `consumedBy`/`consumedAt` are set atomically with the user-doc childIds append in `consumeInvite`.
 */
export type Invite = {
  token: string;
  childId: string;
  /** uid of the user who minted the invite. */
  createdBy: string;
  /** ms epoch. */
  createdAt: number;
  /** ms epoch — invite is rejected if consumed after this. */
  expiresAt: number;
  /** Set on consumption. */
  consumedBy?: string;
  /** Set on consumption (ms epoch). */
  consumedAt?: number;
};
