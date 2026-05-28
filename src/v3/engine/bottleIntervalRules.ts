/** Amount-conditional bottle interval lookup, consumed by the R5 cascade. */

import type { BottleIntervalRule } from "../schemas";

/**
 * Returns the narrowest matching rule's intervalMinutes, or fallbackMinutes
 * when amount is undefined or unmatched. Open-ended ranges (`maxOz` absent)
 * lose to any bounded range that also matches.
 */
export function intervalForAmount(
  rules: BottleIntervalRule[],
  amountOz: number | undefined,
  fallbackMinutes: number,
): number {
  if (amountOz === undefined) return fallbackMinutes;
  const matches = rules.filter(
    (r) => amountOz >= r.minOz && (r.maxOz === undefined || amountOz <= r.maxOz),
  );
  if (matches.length === 0) return fallbackMinutes;
  matches.sort((a, b) => {
    const aSpan = a.maxOz === undefined ? Infinity : a.maxOz - a.minOz;
    const bSpan = b.maxOz === undefined ? Infinity : b.maxOz - b.minOz;
    return aSpan - bSpan;
  });
  return matches[0]!.intervalMinutes;
}
