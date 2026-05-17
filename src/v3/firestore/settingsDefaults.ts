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

import type { Settings } from "../schemas";

/** Schema fallback for `Settings.defaultWakeTime` — 7:00 AM as TimeMin.
 * Re-exported so consumers that need to construct day docs before the
 * live settings doc has loaded (Dashboard pre-wake-gate, etc.) can
 * reference the same value rather than re-typing `7 * 60`. */
export const DEFAULT_WAKE_TIME = 7 * 60;

/** Pastels matching the legacy `--color-owner-jake` / `--color-owner-kelly`
 * tokens. Re-exported so `projectionPlaceholders.ts` mirrors the same
 * values without drift. The §F4 fast-follow will replace this with a
 * theme picker. */
export const DEFAULT_OWNER_COLORS = {
  parent1: "#7a8fa8",
  parent2: "#ce8e7e",
} as const;

const DEFAULTS: Omit<Settings, "childId"> = {
  defaultWakeTime: DEFAULT_WAKE_TIME,
  bedtimeThreshold: 17.5 * 60,
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
    ownerId: "",
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
    parent1: { displayName: "", color: DEFAULT_OWNER_COLORS.parent1 },
    parent2: { displayName: "", color: DEFAULT_OWNER_COLORS.parent2 },
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
 * Mirrors the `migrateOwnerSlot` pattern below. Removable once no docs
 * carry the 80 value.
 */
const LEGACY_PLACEHOLDER_PX_PER_HOUR = 80;

/**
 * One-time migration: rewrite the cutover-era bright placeholder colors
 * (`#0af` / `#f0a`) — which were never intended as production palette
 * values — to the legacy pastels. Applied silently on every read so
 * dev/prod docs written under the old defaults converge without a
 * separate migration script. Safe to remove once no `OwnersConfig` docs
 * carry the legacy placeholder values (§F4 theme picker supersedes).
 */
const LEGACY_PLACEHOLDER_COLORS: Record<"parent1" | "parent2", string> = {
  parent1: "#0af",
  parent2: "#f0a",
};

function migrateOwnerSlot(
  slot: { displayName: string; color: string },
  key: "parent1" | "parent2",
): { displayName: string; color: string } {
  if (slot.color === LEGACY_PLACEHOLDER_COLORS[key]) {
    return { ...slot, color: DEFAULT_OWNER_COLORS[key] };
  }
  return slot;
}

export function withV3SettingsDefaults(input: Partial<Settings> | null): Settings | null {
  if (input === null) return null;
  const merged: Settings = {
    ...DEFAULTS,
    ...input,
    childId: input.childId ?? "",
    bottleChain: { ...DEFAULTS.bottleChain, ...input.bottleChain },
    daycare: {
      ...DEFAULTS.daycare,
      ...input.daycare,
      weekdays: { ...DEFAULTS.daycare.weekdays, ...input.daycare?.weekdays },
    },
    owners: {
      parent1: migrateOwnerSlot(
        { ...DEFAULTS.owners.parent1, ...input.owners?.parent1 },
        "parent1",
      ),
      parent2: migrateOwnerSlot(
        { ...DEFAULTS.owners.parent2, ...input.owners?.parent2 },
        "parent2",
      ),
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
