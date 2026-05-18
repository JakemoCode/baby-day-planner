/**
 * Stringify an OwnerRef into a stable HTML data-attribute value.
 * "parent1" / "parent2" / "other:<otherId>" — same shape on read so
 * CSS selectors in the existing modules (e.g. `[data-owner="parent1"]`)
 * keep working.
 *
 * Returns null for an undefined ref so callers can spread the attribute
 * conditionally without writing `data-owner="undefined"`.
 */

import type { OwnerRef } from "../../schemas";

export function ownerSlotKey(ref: OwnerRef | undefined): string | null {
  if (!ref) return null;
  switch (ref.slot) {
    case "none":
      return null; // §F37: no data-owner attr for unassigned events
    case "parent1":
      return "parent1";
    case "parent2":
      return "parent2";
    case "other":
      return `other:${ref.otherId}`;
  }
}
