"use client";

import styles from "./InstantChip.module.css";
import type { Event, OwnersConfig } from "../../schemas";
import { formatTimeShort } from "../../ui/time";
import { ownerColor, ownerDisplayName } from "../../ui/owners";
import { ownerStyleVar } from "../../ui/ownerStyle";
import { ownerSlotKey } from "./ownerSlotKey";

export type InstantChipProps = {
  event: Event;
  owners: OwnersConfig;
  colorMode: "type" | "owner";
  onClick?: () => void;
};

/**
 * Chip label rules (parity with V2 + new V3 types):
 *   - bottle uses event.label — typically "Bottle N" from R5.4 chronological
 *     renumber, OR "Dream Feed" from the render-time relabel
 *     (src/v3/ui/dreamFeedLabel.ts)
 *   - bedtime → "Bed", pump → "Pump" (or label if it already starts with Pump)
 *   - daycare_dropoff/pickup → "Daycare ↓" / "Daycare ↑"
 *   - daily_recurring / extra → use the event's label directly
 */
function chipText(event: Event): string {
  if (event.type === "bedtime") return "Bed";
  if (event.type === "pump") return event.label.startsWith("Pump") ? event.label : "Pump";
  if (event.type === "daycare_dropoff") return "Daycare ↓";
  if (event.type === "daycare_pickup") return "Daycare ↑";
  return event.label;
}

export function InstantChip({ event, owners, colorMode, onClick }: InstantChipProps) {
  const interactive = !!onClick;
  const Tag = interactive ? "button" : "span";
  const time = formatTimeShort(event.startTime);
  const label = chipText(event);
  const ownerName = ownerDisplayName(event.owner, owners);
  const slotKey = ownerSlotKey(event.owner);
  const a11y = `${event.label} at ${time}${ownerName ? ` ${ownerName}` : ""}`;

  return (
    <Tag
      data-testid="instant-chip"
      data-type={event.type}
      data-color-mode={colorMode}
      data-static={!interactive}
      className={styles.chip}
      style={ownerStyleVar(ownerColor(event.owner, owners))}
      {...(slotKey ? { "data-owner": slotKey } : {})}
      {...(interactive
        ? { type: "button" as const, onClick, "aria-label": a11y }
        : { role: "presentation" as const })}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.body}>
        <span className={styles.topRow}>
          <span className={styles.label}>{label}</span>
          <span className={styles.time}>{time}</span>
        </span>
        {ownerName && (
          <span className={styles.ownerName} {...(slotKey ? { "data-owner": slotKey } : {})}>
            {ownerName}
          </span>
        )}
      </span>
    </Tag>
  );
}
