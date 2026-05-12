/**
 * Amount-conditional bottle interval lookup. Ported from V2
 * (`src/domain/bottleRules.ts` at commit 9ae6d1a) — silently dropped
 * during the V3 rewrite; restored 2026-05-11.
 *
 * Consumed by R5.1 and R5.11 in `src/v3/engine/rules/bottles.ts` to
 * compute the cascade interval based on the previous bottle's amount.
 */

import type { BottleIntervalRule } from "../schemas";

/**
 * Look up the bottle-to-bottle interval for the given amount. Returns
 * the most-specific (narrowest range) matching rule's `intervalMinutes`,
 * or `fallbackMinutes` when amount is undefined or no rule matches.
 *
 * Range semantics:
 * - Bounded: `[minOz, maxOz]` — both inclusive.
 * - Open-ended: `[minOz, ∞)` — when `maxOz` is undefined.
 *
 * Specificity is span (`maxOz - minOz`); open-ended ranges count as
 * `Infinity` and lose to any bounded range that also matches.
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
