/**
 * V3 Settings defensive defaults.
 *
 * Bridges partial Firestore docs (or V2-shape leftovers from before the
 * cutover) into a fully-shaped V3 Settings, so the engine doesn't crash
 * on `undefined.bottleChain` etc. when a real-world doc is missing
 * fields the V3 schema added.
 *
 * This is a transitional safety net. Once the Settings page is cutover
 * to V3 and writes complete docs, partial docs stop happening; this
 * helper either retires or stays as cheap insurance.
 *
 * Defaults are deliberately conservative: numeric defaults match the
 * engine's expected ranges, daycare is disabled, owners use empty
 * displayNames so the UI prompts the user to set them.
 */

import type { BottleIntervalRule, Settings, TimeMin } from "../schemas";

/**
 * Parse "HH:MM" → TimeMin (minutes since midnight). If already a number,
 * pass through. Returns 0 for malformed strings (defensive — engine still
 * runs, value is visibly wrong but not NaN).
 *
 * TODO(PR-C1): Remove this helper and all V2 string→TimeMin coercion
 * below once the V2 cleanup wave wipes string-shaped time fields from
 * Firestore. After cleanup, all callers write TimeMin numbers directly.
 */
function parseTimeStringOrNumber(value: string | number): TimeMin {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

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
  bedtimeThreshold: 19 * 60,
  defaultNapLengthMinutes: 90,
  shortNapThresholdMinutes: 45,
  shortNapAdjustmentMinutes: 30,
  wakeWindowsMinutes: [120, 150, 180, 180, 180, 180],
  napDurationMin: 30,
  napDurationMax: 180,
  defaultBottleAmountOz: 5,
  defaultBottleIntervalMinutes: 180,
  bottleRules: [],
  bottleIntervalRules: [],
  bottleChain: { bottlesPerDay: 5, bufferAfterWakeMinutes: 10 },
  minBottleIntervalMinutes: 90,
  putdownLeadMinutes: 15,
  pumpTimes: [],
  pumpOwnerSlot: "parent2",
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

/**
 * One-time migration: V2 stored amount-conditional bottle interval rules
 * under the field name `bottleRules` with shape
 * `{ minOz, maxOz?, intervalMinutes }`. The V3 schema reused the same name
 * for an unrelated age-based rule (`{ minWeeks, amountOz }`) and added a
 * new `bottleIntervalRules` field for the V2 shape.
 *
 * Without migration, all existing user data (`bottleRules: [...]` in
 * Firestore) sits inert — the feature is silently dead for everyone who
 * configured rules under V2.
 *
 * Detection: input has a non-empty `bottleRules` array AND the first
 * element looks like a V2 interval rule (has `minOz`). Move those entries
 * into `bottleIntervalRules` and clear `bottleRules` (which V3 doesn't
 * consume anyway).
 *
 * Safe to remove once no docs carry V2-shape `bottleRules`. The reverse
 * direction (V3-native age rules in `bottleRules`) is preserved by
 * shape-sniffing only.
 */
function isV2BottleRuleShape(entry: unknown): entry is BottleIntervalRule {
  return typeof entry === "object" && entry !== null && "minOz" in entry;
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

  // TODO(PR-C1): Remove the V2 string→TimeMin coercion below once the V2
  // cleanup wave wipes string-shaped time fields from Firestore.
  const rawPumpTimes = (input.pumpTimes ?? merged.pumpTimes) as Array<string | number>;
  merged.pumpTimes = rawPumpTimes.map((v) => parseTimeStringOrNumber(v));
  merged.bedtimeThreshold = parseTimeStringOrNumber(
    merged.bedtimeThreshold as unknown as string | number,
  );
  merged.defaultWakeTime = parseTimeStringOrNumber(
    merged.defaultWakeTime as unknown as string | number,
  );
  merged.dailyRecurring = merged.dailyRecurring.map((entry) => ({
    ...entry,
    time: parseTimeStringOrNumber(entry.time as unknown as string | number),
  }));

  // V2 → V3 bottle interval rule migration. V2 wrote interval rules into
  // `bottleRules`; V3 reused that field name for an unrelated shape and
  // added `bottleIntervalRules` for the V2 data. Sniff shape: if input's
  // `bottleRules` carries V2-shaped entries AND `bottleIntervalRules` is
  // empty, move them over. Already-migrated docs (V3-shape bottleRules,
  // or non-empty bottleIntervalRules) are left alone.
  const rawBottleRules = input.bottleRules as unknown;
  if (
    Array.isArray(rawBottleRules) &&
    rawBottleRules.length > 0 &&
    isV2BottleRuleShape(rawBottleRules[0]) &&
    merged.bottleIntervalRules.length === 0
  ) {
    merged.bottleIntervalRules = rawBottleRules.filter(isV2BottleRuleShape);
    merged.bottleRules = [];
  }

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
