import type { BottleRule } from "./types";

export function intervalForAmount(
  rules: BottleRule[],
  amountOz: number | undefined,
  fallbackMinutes: number,
): number {
  if (amountOz === undefined) return fallbackMinutes;
  const matches = rules.filter(
    (r) => amountOz >= r.minOz && (r.maxOz === undefined || amountOz <= r.maxOz),
  );
  if (matches.length === 0) return fallbackMinutes;
  // Most specific = narrowest range; open-ended ranges (maxOz undefined) are least specific.
  matches.sort((a, b) => {
    const aSpan = a.maxOz === undefined ? Infinity : a.maxOz - a.minOz;
    const bSpan = b.maxOz === undefined ? Infinity : b.maxOz - b.minOz;
    return aSpan - bSpan;
  });
  return matches[0]!.intervalMinutes;
}
