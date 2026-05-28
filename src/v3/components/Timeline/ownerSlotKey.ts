/** Serializes OwnerRef to a stable `data-owner` value matching existing CSS selectors; null for none/unassigned. */

import type { OwnerRef } from "../../schemas";

export function ownerSlotKey(ref: OwnerRef | undefined): string | null {
  if (!ref) return null;
  switch (ref.slot) {
    case "none":
      return null; // §F37: unassigned — no attr
    case "parent1":
      return "parent1";
    case "parent2":
      return "parent2";
    case "other":
      return `other:${ref.otherId}`;
  }
}
