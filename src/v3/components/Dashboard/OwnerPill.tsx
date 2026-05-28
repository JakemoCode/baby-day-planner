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

/** Tinted owner name pill; null when owner is unset or the otherId no longer resolves. */
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
