/**
 * V3 Settings construction and normalization.
 *
 * Two seams:
 *
 *   makeDefaultSettings(childId)
 *     Pure construction — builds a fully-shaped Settings from scratch with
 *     conservative defaults. No legacy awareness. Used by the settings page
 *     on first run (no doc exists yet) and the welcome/onboarding page.
 *
 *   normalizeSettingsDoc(raw)
 *     Firestore read seam — applies migrations for legacy shapes, then fills
 *     any missing required fields via makeDefaultSettings logic. Used by the
 *     converter on every read.
 *
 * Defaults are deliberately conservative: numeric defaults match the
 * engine's expected ranges, daycare is disabled, owners use empty
 * displayNames so the UI prompts the user to set them.
 */

import type { PumpSession, Settings } from "../schemas";

/** Schema fallback for `Settings.defaultWakeTime` — 7:00 AM as TimeMin.
 * Re-exported so consumers that need to construct day docs before the
 * live settings doc has loaded (Dashboard pre-wake-gate, etc.) can
 * reference the same value rather than re-typing `7 * 60`. */
export const DEFAULT_WAKE_TIME = 7 * 60;

const DEFAULTS: Omit<Settings, "childId"> = {
  defaultWakeTime: DEFAULT_WAKE_TIME,
  bedtimeThreshold: 17 * 60 + 30,
  defaultNapLengthMinutes: 45,
  shortNapThresholdMinutes: 25,
  shortNapAdjustmentMinutes: 10,
  wakeWindowsMinutes: [95, 100, 110, 120, 120, 120],
  napDurationMin: 20,
  napDurationMax: 180,
  defaultBottleAmountOz: 6,
  defaultBottleIntervalMinutes: 180,
  bottleRules: [],
  bottleIntervalRules: [],
  bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
  minBottleIntervalMinutes: 90,
  putdownLeadMinutes: 15,
  pumpTimes: [],
  pumpOwnerSlot: "parent2",
  defaultPumpDurationMinutes: 25,
  dreamFeedEnabled: false,
  dailyRecurring: [],
  daycare: {
    enabled: false,
    dropoffTime: 8 * 60,
    pickupTime: 17 * 60,
    weekdays: {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    },
  },
  owners: {
    parent1: { displayName: "" },
    parent2: { displayName: "" },
    other: [],
  },
  timelineColorMode: "type",
  // V2's default was 120 px/hour. The cutover stub set 80 by accident
  // and a one-time migration (in normalizeSettingsDoc) converts legacy
  // 80 values back to 120 on read.
  timelinePxPerHour: 120,
  timelineDimPast: true,
};

/**
 * Cutover-era stub default that was never an intentional product choice.
 * Removable once no docs carry the 80 value.
 */
const LEGACY_PLACEHOLDER_PX_PER_HOUR = 80;

/**
 * Older settings docs persisted `pumpTimes` as `number[]` (TimeMin array).
 * The current shape is `PumpSession[]` with an optional per-session
 * duration override. Normalize legacy entries on read so callers always
 * see the object shape.
 */
function normalizePumpTimes(raw: unknown): PumpSession[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "number") return { time: entry };
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as { time?: unknown }).time === "number"
      ) {
        const t = (entry as { time: number }).time;
        const d = (entry as { durationMinutes?: unknown }).durationMinutes;
        return typeof d === "number" ? { time: t, durationMinutes: d } : { time: t };
      }
      return null;
    })
    .filter((p): p is PumpSession => p !== null);
}

/**
 * Pure construction seam — builds a fully-shaped Settings from scratch.
 * No legacy migration logic fires. Used by the settings page on first run
 * when no Firestore doc exists yet, and by the welcome/onboarding page.
 */
export function makeDefaultSettings(childId: string): Settings {
  return {
    ...DEFAULTS,
    childId,
    // Deep-clone mutable nested objects so callers can't mutate the DEFAULTS.
    bottleChain: { ...DEFAULTS.bottleChain },
    daycare: {
      ...DEFAULTS.daycare,
      weekdays: { ...DEFAULTS.daycare.weekdays },
    },
    owners: {
      parent1: { ...DEFAULTS.owners.parent1 },
      parent2: { ...DEFAULTS.owners.parent2 },
      other: [],
    },
    pumpTimes: [],
    bottleRules: [],
    bottleIntervalRules: [],
    dailyRecurring: [],
    wakeWindowsMinutes: [...DEFAULTS.wakeWindowsMinutes],
  };
}

/**
 * Firestore read seam — applies all legacy migrations, then fills missing
 * required fields from DEFAULTS. Called by v3SettingsConverter on every
 * Firestore read.
 *
 * Migrations applied:
 * 1. pumpTimes: number[] → PumpSession[]  (pre-#155 shape)
 * 2. timelinePxPerHour 80 → 120 heuristic rewrite
 *    (gated on timelineColorMode == null so deliberate 80 values are kept)
 */
export function normalizeSettingsDoc(raw: unknown): Settings {
  const input = raw as Partial<Settings>;

  const merged: Settings = {
    ...DEFAULTS,
    ...input,
    childId: input.childId ?? "",
    pumpTimes: normalizePumpTimes(
      (input as { pumpTimes?: unknown }).pumpTimes ?? DEFAULTS.pumpTimes,
    ),
    bottleChain: { ...DEFAULTS.bottleChain, ...input.bottleChain },
    daycare: {
      ...DEFAULTS.daycare,
      ...input.daycare,
      weekdays: { ...DEFAULTS.daycare.weekdays, ...input.daycare?.weekdays },
    },
    owners: {
      parent1: { ...DEFAULTS.owners.parent1, ...input.owners?.parent1 },
      parent2: { ...DEFAULTS.owners.parent2, ...input.owners?.parent2 },
      other: input.owners?.other ?? DEFAULTS.owners.other,
    },
  };

  // One-time migration: rewrite the cutover-era 80 px/hour stub to V2's
  // intended 120. Gated on `input.timelineColorMode == null` (the new
  // field added in this same PR) so we don't clobber a user who later
  // chooses 80 intentionally — any doc with 80 AND the new colorMode
  // field set must be a deliberate choice, not the legacy stub.
  if (
    merged.timelinePxPerHour === LEGACY_PLACEHOLDER_PX_PER_HOUR &&
    input.timelineColorMode == null
  ) {
    merged.timelinePxPerHour = DEFAULTS.timelinePxPerHour;
  }

  return merged;
}

/**
 * @deprecated Use `normalizeSettingsDoc` from the Firestore converter seam,
 * or `makeDefaultSettings` for first-run construction. This wrapper exists
 * for backward-compat and will be removed once all callers are migrated.
 */
export function withV3SettingsDefaults(input: Partial<Settings> | null): Settings | null {
  if (input === null) return null;
  return normalizeSettingsDoc(input);
}
