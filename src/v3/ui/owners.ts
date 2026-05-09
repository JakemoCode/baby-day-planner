/**
 * Owner display-name + color lookup. The engine stores OwnerRef as a
 * slot identity (parent1 / parent2 / other[id]); the configured display
 * string lives on Settings.owners and is read here at render time.
 *
 * Returning `""` / `null` for missing refs (stale `otherId`, undefined
 * ref) is deliberate: a deleted "other" owner shouldn't crash the
 * timeline. The renderer falls back to its unassigned affordance.
 */

import type { OwnerRef, OwnersConfig } from "../schemas";

export function ownerDisplayName(ref: OwnerRef | undefined, owners: OwnersConfig): string {
  if (!ref) return "";
  switch (ref.slot) {
    case "parent1":
      return owners.parent1.displayName;
    case "parent2":
      return owners.parent2.displayName;
    case "other":
      return owners.other.find((o) => o.id === ref.otherId)?.displayName ?? "";
  }
}

export function ownerColor(ref: OwnerRef | undefined, owners: OwnersConfig): string | null {
  if (!ref) return null;
  switch (ref.slot) {
    case "parent1":
      return owners.parent1.color;
    case "parent2":
      return owners.parent2.color;
    case "other":
      return owners.other.find((o) => o.id === ref.otherId)?.color ?? null;
  }
}
