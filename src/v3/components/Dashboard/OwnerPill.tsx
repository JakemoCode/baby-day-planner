import type { OwnerRef, OwnersConfig } from "@/v3/schemas";
import { ownerColor, ownerDisplayName } from "@/v3/ui/owners";
import { ownerStyleVar } from "@/v3/ui/ownerStyle";
import styles from "./OwnerPill.module.css";

export type OwnerPillProps = {
  owner: OwnerRef | undefined;
  owners: OwnersConfig;
  /** Optional className for variant styling (composed onto the base pill). */
  className?: string | undefined;
};

/**
 * Small inline pill showing an owner's display name, tinted with their
 * configured color via the `--owner-color` CSS variable.
 *
 * Returns `null` when `owner` is undefined, or when the owner ref no
 * longer resolves to a configured owner (stale `otherId`).
 */
export function OwnerPill({ owner, owners, className }: OwnerPillProps) {
  if (!owner) return null;
  const name = ownerDisplayName(owner, owners);
  if (!name) return null;
  const cls = className ? `${styles.pill} ${className}` : styles.pill;
  return (
    <span className={cls} style={ownerStyleVar(ownerColor(owner, owners))}>
      {name}
    </span>
  );
}
