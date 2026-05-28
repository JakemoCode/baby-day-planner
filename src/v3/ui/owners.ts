/**
 * Render-time owner display-name + color lookup from OwnerRef slot identity.
 * Missing/stale refs return ""/null deliberately so a deleted "other" owner
 * doesn't crash the timeline. `ownerColor` maps "other" owners to slot tokens
 * `--color-owner-3..6` by index, cycling if more than four are configured.
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
