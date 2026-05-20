/**
 * V3 Settings defensive defaults.
 *
 * Apply V3 defaults to a partial settings doc so the engine never sees
 * an undefined `bottleChain`, `daycare.weekdays`, etc.
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
    dropoffOwnerSlot: "parent1",
    pickupOwnerSlot: "parent2",
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
  // and a one-time migration (below) converts legacy 80 values back to
  // 120 on read.
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

export function withV3SettingsDefaults(input: Partial<Settings> | null): Settings | null {
  if (input === null) return null;
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
