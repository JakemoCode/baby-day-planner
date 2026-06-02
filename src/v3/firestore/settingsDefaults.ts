/**
 * V3 Settings construction and normalization. Two seams:
 * - `makeDefaultSettings(childId)` — pure first-run construction, no legacy awareness.
 * - `normalizeSettingsDoc(raw)` — Firestore read seam; applies legacy migrations then
 *   fills missing fields. Used by the converter on every read.
 * Defaults are conservative: daycare disabled, owners have empty displayNames.
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
  earliestBedtime: 18 * 60,
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
  bottleChain: { bufferAfterWakeMinutes: 10 },
  minBottleIntervalMinutes: 90,
  putdownLeadMinutes: 15,
  pumpTimes: [],
  pumpOwnerSlot: "parent2",
  defaultPumpDurationMinutes: 25,
  dreamFeedEnabled: false,
  dreamFeedTime: 23 * 60,
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
 * Pre-#155 docs persisted `pumpTimes` as `number[]`; current shape is
 * `PumpSession[]`. Normalize on read so callers always see the object shape.
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
 * Pure construction seam — builds fully-shaped Settings from scratch.
 * No legacy migration. Used on first run (no doc yet) and during onboarding.
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
 * Firestore read seam — applies legacy migrations then fills missing fields.
 * Called by v3SettingsConverter on every read. Migrations:
 * 1. pumpTimes: number[] → PumpSession[] (pre-#155)
 * 2. timelinePxPerHour 80 → 120 (gated on timelineColorMode==null so
 *    deliberate 80 values are preserved)
 */
export function normalizeSettingsDoc(raw: unknown): Settings {
  const input = raw as Partial<Settings>;

  // Fresh clone so unoverridden arrays/objects are never shared DEFAULTS refs.
  const baseline = makeDefaultSettings(input.childId ?? "");

  const merged: Settings = {
    ...baseline,
    ...input,
    childId: input.childId ?? "",
    pumpTimes: normalizePumpTimes(
      (input as { pumpTimes?: unknown }).pumpTimes ?? baseline.pumpTimes,
    ),
    bottleChain: { ...baseline.bottleChain, ...input.bottleChain },
    daycare: {
      ...baseline.daycare,
      ...input.daycare,
      weekdays: { ...baseline.daycare.weekdays, ...input.daycare?.weekdays },
    },
    owners: {
      parent1: { ...baseline.owners.parent1, ...input.owners?.parent1 },
      parent2: { ...baseline.owners.parent2, ...input.owners?.parent2 },
      other: input.owners?.other ?? baseline.owners.other,
    },
  };

  // One-time migration: rewrite the cutover-era 80 px/hour stub to 120.
  // Gated on timelineColorMode==null so deliberate 80 values (set alongside
  // the colorMode field) are preserved.
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
