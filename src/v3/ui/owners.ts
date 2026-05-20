/**
 * Owner display-name + color lookup. The engine stores OwnerRef as a
 * slot identity (parent1 / parent2 / other[id]); the configured display
 * string lives on Settings.owners and is read here at render time.
 *
 * Returning `""` / `null` for missing refs (stale `otherId`, undefined
 * ref) is deliberate: a deleted "other" owner shouldn't crash the
 * timeline. The renderer falls back to its unassigned affordance.
 *
 * §F4 (2026-05-20): `ownerColor` returns CSS variable references against
 * the slot-keyed `--color-owner-*` tokens rather than reading a per-owner
 * hex from Settings. parent-1/parent-2 are fixed; "other" owners map to
 * slots 3..6 by their index in `owners.other[]`, cycling back to 3 if
 * more than four are configured (rare).
 */

import type { OwnerRef, OwnersConfig } from "../schemas";

const OTHER_SLOT_TOKENS = [
  "var(--color-owner-3)",
  "var(--color-owner-4)",
  "var(--color-owner-5)",
  "var(--color-owner-6)",
] as const;

export function ownerDisplayName(ref: OwnerRef | undefined, owners: OwnersConfig): string {
  if (!ref) return "";
  switch (ref.slot) {
    case "none":
      return "";
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
    case "none":
      return null;
    case "parent1":
      return "var(--color-owner-parent-1)";
    case "parent2":
      return "var(--color-owner-parent-2)";
    case "other": {
      const i = owners.other.findIndex((o) => o.id === ref.otherId);
      if (i < 0) return null;
      return OTHER_SLOT_TOKENS[i % OTHER_SLOT_TOKENS.length] ?? null;
    }
  }
}
